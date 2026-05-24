import { describe, it, expect } from "vitest";
import plugin, {
  parseModerationResponse,
  fallbackModeration
} from "../src/sandbox-entry";
import type {
  CommentModerateEvent,
  PluginContext,
  ModerationDecision
} from "emdash";

// =============================================================================
// Fakes
// =============================================================================

class FakeKV {
  public store = new Map<string, any>();

  async get<T>(key: string): Promise<T | null> {
    const val = this.store.get(key);
    return val !== undefined ? (val as T) : null;
  }

  async set(key: string, value: any): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }
}

class FakeHttp {
  public mockResponse: any = null;
  public mockStatus = 200;
  public mockOk = true;
  public throwError: Error | null = null;
  public lastRequest: { url: string; options?: any } | null = null;

  async fetch(url: string, options?: any): Promise<any> {
    this.lastRequest = { url, options };
    if (this.throwError) {
      throw this.throwError;
    }
    const responseData = this.mockResponse;
    const ok = this.mockOk;
    const status = this.mockStatus;
    return {
      ok,
      status,
      json: async () => responseData
    };
  }
}

function createFakeContext(kv: FakeKV, http: FakeHttp): PluginContext {
  return {
    kv,
    http,
    log: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    },
    site: {
      siteName: "Test Site",
      siteUrl: "http://localhost:4321",
      locale: "en"
    },
    url: (path: string) => `http://localhost:4321${path}`
  } as unknown as PluginContext;
}

function createBaseEvent(overrides: Partial<CommentModerateEvent> = {}): CommentModerateEvent {
  return {
    comment: {
      collection: "posts",
      contentId: "123",
      parentId: null,
      authorName: "John Doe",
      authorEmail: "john@example.com",
      authorUserId: null,
      body: "This is a comment",
      ipHash: "hash123",
      userAgent: "Mozilla"
    },
    metadata: {},
    collectionSettings: {
      commentsEnabled: true,
      commentsModeration: "first_time",
      commentsClosedAfterDays: 90,
      commentsAutoApproveUsers: true
    },
    priorApprovedCount: 0,
    ...overrides
  } as CommentModerateEvent;
}

// =============================================================================
// Test Suites
// =============================================================================

describe("parseModerationResponse", () => {
  it("should parse valid clean JSON string", () => {
    const raw = '{"spam": false, "toxic": false}';
    expect(parseModerationResponse(raw)).toEqual({ spam: false, toxic: false });
  });

  it("should parse fenced markdown JSON block", () => {
    const raw = "Here is the response:\n```json\n{\n  \"spam\": true,\n  \"toxic\": false\n}\n```\nHope that helps.";
    expect(parseModerationResponse(raw)).toEqual({ spam: true, toxic: false });
  });

  it("should return null on invalid JSON", () => {
    const raw = "not a json string";
    expect(parseModerationResponse(raw)).toBeNull();
  });

  it("should return null if fields are missing or wrong type", () => {
    const raw1 = '{"spam": false}';
    const raw2 = '{"spam": "false", "toxic": false}';
    expect(parseModerationResponse(raw1)).toBeNull();
    expect(parseModerationResponse(raw2)).toBeNull();
  });

  it("should parse JSON with extra fields (ignores them)", () => {
    const raw = '{"spam": false, "toxic": false, "confidence": 0.9}';
    expect(parseModerationResponse(raw)).toEqual({ spam: false, toxic: false });
  });

  it("should return null for whitespace-only input", () => {
    expect(parseModerationResponse("   ")).toBeNull();
  });

  it("should extract first JSON object from text with multiple braced sections", () => {
    // The lazy regex should match the first {...} — which here is the valid JSON
    const raw = 'The result is {"spam": true, "toxic": false} based on analysis.';
    expect(parseModerationResponse(raw)).toEqual({ spam: true, toxic: false });
  });
});

describe("fallbackModeration", () => {
  it("should auto-approve authenticated CMS user when configured", () => {
    const event = createBaseEvent({
      comment: {
        collection: "posts",
        contentId: "123",
        parentId: null,
        authorName: "Admin",
        authorEmail: "admin@test.com",
        authorUserId: "user_123",
        body: "Hello",
        ipHash: null,
        userAgent: null
      },
      collectionSettings: {
        commentsEnabled: true,
        commentsModeration: "first_time",
        commentsClosedAfterDays: 90,
        commentsAutoApproveUsers: true
      }
    });
    expect(fallbackModeration(event)).toEqual({
      status: "approved",
      reason: "Authenticated CMS user"
    });
  });

  it("should auto-approve if commentsModeration is none", () => {
    const event = createBaseEvent({
      collectionSettings: {
        commentsEnabled: true,
        commentsModeration: "none",
        commentsClosedAfterDays: 90,
        commentsAutoApproveUsers: false
      }
    });
    expect(fallbackModeration(event)).toEqual({
      status: "approved",
      reason: "Moderation disabled"
    });
  });

  it("should auto-approve returning commenter if commentsModeration is first_time", () => {
    const event = createBaseEvent({
      collectionSettings: {
        commentsEnabled: true,
        commentsModeration: "first_time",
        commentsClosedAfterDays: 90,
        commentsAutoApproveUsers: false
      },
      priorApprovedCount: 1
    });
    expect(fallbackModeration(event)).toEqual({
      status: "approved",
      reason: "Returning commenter"
    });
  });

  it("should hold as pending for new commenter if commentsModeration is first_time", () => {
    const event = createBaseEvent({
      collectionSettings: {
        commentsEnabled: true,
        commentsModeration: "first_time",
        commentsClosedAfterDays: 90,
        commentsAutoApproveUsers: false
      },
      priorApprovedCount: 0
    });
    expect(fallbackModeration(event)).toEqual({
      status: "pending",
      reason: "Held for review"
    });
  });
});

describe("Plugin comment:moderate hook integration", () => {
  const handler = plugin.hooks["comment:moderate"].handler;

  it("should return pending for empty comments without calling AI", async () => {
    const kv = new FakeKV();
    const http = new FakeHttp();
    const ctx = createFakeContext(kv, http);
    const event = createBaseEvent({
      comment: {
        collection: "posts",
        contentId: "123",
        parentId: null,
        authorName: "John",
        authorEmail: "john@example.com",
        authorUserId: null,
        body: "",
        ipHash: null,
        userAgent: null
      }
    });

    const result = await handler(event, ctx);
    expect(result).toEqual({ status: "pending", reason: "AI: Empty comment" });
    expect(event.metadata.ai_moderation).toEqual({ error: "Empty comment" });
    expect(http.lastRequest).toBeNull();
  });

  it("should run fallback moderation if credentials are not configured", async () => {
    const kv = new FakeKV(); // empty credentials
    const http = new FakeHttp();
    const ctx = createFakeContext(kv, http);
    const event = createBaseEvent();

    const result = await handler(event, ctx);
    // falls back to first-time pending because priorApprovedCount = 0
    expect(result.status).toBe("pending");
    expect(event.metadata.ai_moderation?.decision).toBe("pending");
    expect(http.lastRequest).toBeNull();
  });

  it("should call Cloudflare AI and approve safe comments", async () => {
    const kv = new FakeKV();
    await kv.set("settings:accountId", "acc123");
    await kv.set("settings:apiToken", "token123");

    const http = new FakeHttp();
    http.mockResponse = {
      success: true,
      result: { response: '{"spam": false, "toxic": false}' }
    };

    const ctx = createFakeContext(kv, http);
    const event = createBaseEvent({
      comment: {
        collection: "posts",
        contentId: "123",
        parentId: null,
        authorName: "John",
        authorEmail: "john@example.com",
        authorUserId: null,
        body: "Hello world",
        ipHash: null,
        userAgent: null
      }
    });

    const result = await handler(event, ctx);
    expect(result.status).toBe("approved");
    expect(event.metadata.ai_moderation).toEqual({
      decision: "approved",
      reason: "AI: spam=false, toxic=false"
    });
    expect(http.lastRequest?.url).toContain("/acc123/ai/run/");
    expect(http.lastRequest?.options?.headers?.Authorization).toBe("Bearer token123");
  });

  it("should flag spam comments", async () => {
    const kv = new FakeKV();
    await kv.set("settings:accountId", "acc123");
    await kv.set("settings:apiToken", "token123");

    const http = new FakeHttp();
    http.mockResponse = {
      success: true,
      result: { response: '{"spam": true, "toxic": false}' }
    };

    const ctx = createFakeContext(kv, http);
    const event = createBaseEvent();

    const result = await handler(event, ctx);
    expect(result.status).toBe("spam");
    expect(event.metadata.ai_moderation?.decision).toBe("spam");
  });

  it("should hold toxic comments as pending", async () => {
    const kv = new FakeKV();
    await kv.set("settings:accountId", "acc123");
    await kv.set("settings:apiToken", "token123");

    const http = new FakeHttp();
    http.mockResponse = {
      success: true,
      result: { response: '{"spam": false, "toxic": true}' }
    };

    const ctx = createFakeContext(kv, http);
    const event = createBaseEvent();

    const result = await handler(event, ctx);
    expect(result.status).toBe("pending");
    expect(event.metadata.ai_moderation?.decision).toBe("pending");
  });

  it("should fall back if Cloudflare AI returns HTTP error status", async () => {
    const kv = new FakeKV();
    await kv.set("settings:accountId", "acc123");
    await kv.set("settings:apiToken", "token123");

    const http = new FakeHttp();
    http.mockOk = false;
    http.mockStatus = 500;

    const ctx = createFakeContext(kv, http);
    const event = createBaseEvent();

    const result = await handler(event, ctx);
    expect(result.status).toBe("pending"); // fallback first-time moderation
  });

  it("should fall back if Cloudflare AI request encounters exception", async () => {
    const kv = new FakeKV();
    await kv.set("settings:accountId", "acc123");
    await kv.set("settings:apiToken", "token123");

    const http = new FakeHttp();
    http.throwError = new Error("Network timeout");

    const ctx = createFakeContext(kv, http);
    const event = createBaseEvent();

    const result = await handler(event, ctx);
    expect(result.status).toBe("pending"); // fallback first-time moderation
  });

  it("should mark spam when both spam and toxic are true (spam wins)", async () => {
    const kv = new FakeKV();
    await kv.set("settings:accountId", "acc123");
    await kv.set("settings:apiToken", "token123");

    const http = new FakeHttp();
    http.mockResponse = {
      success: true,
      result: { response: '{"spam": true, "toxic": true}' }
    };

    const ctx = createFakeContext(kv, http);
    const event = createBaseEvent();

    const result = await handler(event, ctx);
    expect(result.status).toBe("spam");
    expect(event.metadata.ai_moderation).toEqual({
      decision: "spam",
      reason: "AI: spam=true, toxic=true"
    });
  });

  it("should use custom model from KV in the API URL", async () => {
    const kv = new FakeKV();
    await kv.set("settings:accountId", "acc123");
    await kv.set("settings:apiToken", "token123");
    await kv.set("settings:model", "@cf/mistral/mistral-7b-instruct-v0.2");

    const http = new FakeHttp();
    http.mockResponse = {
      success: true,
      result: { response: '{"spam": false, "toxic": false}' }
    };

    const ctx = createFakeContext(kv, http);
    const event = createBaseEvent();

    await handler(event, ctx);
    expect(http.lastRequest?.url).toContain("@cf/mistral/mistral-7b-instruct-v0.2");
    expect(http.lastRequest?.url).not.toContain("llama");
  });

  it("should truncate very long comment bodies before sending to AI", async () => {
    const kv = new FakeKV();
    await kv.set("settings:accountId", "acc123");
    await kv.set("settings:apiToken", "token123");

    const http = new FakeHttp();
    http.mockResponse = {
      success: true,
      result: { response: '{"spam": false, "toxic": false}' }
    };

    const ctx = createFakeContext(kv, http);
    const longBody = "x".repeat(20_000);
    const event = createBaseEvent({
      comment: {
        collection: "posts",
        contentId: "123",
        parentId: null,
        authorName: "John",
        authorEmail: "john@example.com",
        authorUserId: null,
        body: longBody,
        ipHash: null,
        userAgent: null
      }
    });

    await handler(event, ctx);

    const sentBody = JSON.parse(http.lastRequest?.options?.body);
    const userMessage = sentBody.messages.find((m: any) => m.role === "user");
    expect(userMessage.content.length).toBe(10_000);
  });
});

describe("Plugin plugin:install hook", () => {
  const installHandler = plugin.hooks["plugin:install"].handler;

  it("should seed default model if not already set", async () => {
    const kv = new FakeKV();
    const http = new FakeHttp();
    const ctx = createFakeContext(kv, http);

    await installHandler({} as any, ctx);
    expect(await kv.get("settings:model")).toBe("@cf/meta/llama-3.1-8b-instruct");
  });

  it("should not overwrite existing model setting", async () => {
    const kv = new FakeKV();
    await kv.set("settings:model", "@cf/mistral/mistral-7b-instruct-v0.2");
    const http = new FakeHttp();
    const ctx = createFakeContext(kv, http);

    await installHandler({} as any, ctx);
    expect(await kv.get("settings:model")).toBe("@cf/mistral/mistral-7b-instruct-v0.2");
  });
});
