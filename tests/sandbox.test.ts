import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPluginRuntimeTestHost,
  type PluginRuntimeTestHost
} from "@emdash-cms/plugin-test";

let host: PluginRuntimeTestHost | undefined;
let contentId: string;
const aiUrl = "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/meta/llama-3.1-8b-instruct";

async function submitComment(body = "Thank you for explaining this clearly.") {
  return host!.actions.comments.submit({
    collection: "posts",
    contentId,
    authorName: "Reader",
    authorEmail: "reader@example.com",
    body
  });
}

beforeEach(async () => {
  host = await createPluginRuntimeTestHost();
  await host.fixtures.collection({
    slug: "posts", label: "Posts", commentsEnabled: true, commentsModeration: "all"
  });
  const post = await host.fixtures.content("posts", { data: {}, status: "published" });
  contentId = post.id;
  await host.fixtures.plugin.kv("settings:accountId", "test-account");
  await host.fixtures.plugin.kv("settings:apiToken", "test-token");
});

afterEach(async () => {
  await host?.dispose();
  host = undefined;
  vi.unstubAllEnvs();
});

describe("sandboxed comment moderation", () => {
  it("classifies comments using the declared admin settings", async () => {
    vi.stubEnv("EMDASH_ENCRYPTION_KEY", "emdash_enc_v1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    const saved = await host!.actions.plugin.updateSettings({
      accountId: "test-account",
      apiToken: "test-token",
      model: "@cf/custom/model"
    });

    expect(saved).toMatchObject({
      success: true,
      data: {
        schema: {
          accountId: { type: "string" },
          apiToken: { type: "secret" },
          model: { type: "string", default: "@cf/meta/llama-3.1-8b-instruct" }
        },
        values: { accountId: "test-account", model: "@cf/custom/model" },
        secretsSet: { apiToken: true }
      }
    });
    expect(JSON.stringify(saved)).not.toContain("test-token");

    const customUrl = "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/custom/model";
    await host!.http.respond(customUrl, Response.json({
      success: true, result: { response: '{"spam":true,"toxic":false}' }
    }));
    const response = await submitComment("Buy cheap pills now!");
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { status: "spam" } });
    expect(host!.http.requests()[0]).toMatchObject({
      url: customUrl,
      headers: { authorization: "Bearer test-token" }
    });
  });

  it("approves a clean comment through the production comment submission path", async () => {
    await host!.http.respond(
      aiUrl,
      Response.json({ success: true, result: { response: '{"spam":false,"toxic":false}' } })
    );

    const response = await submitComment();

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { status: "approved" } });
    expect(await host!.inspect.comments()).toMatchObject([{ status: "approved" }]);
    const requests = host!.http.requests();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: aiUrl,
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" }
    });
    expect(JSON.parse(new TextDecoder().decode(requests[0].body))).toMatchObject({
      messages: [{ role: "system" }, { role: "user", content: "Thank you for explaining this clearly." }]
    });
  });

  it.each([
    { body: "Buy cheap pills now! Visit my shop!", spam: true, toxic: false, status: "spam" },
    { body: "You are worthless and I hate you.", spam: false, toxic: true, status: "pending" },
    { body: "Abusive spam", spam: true, toxic: true, status: "spam" }
  ])("classifies '$body' as $status through the sandbox", async ({ body, spam, toxic, status }) => {
    await host!.http.respond(aiUrl, Response.json({
      success: true, result: { response: JSON.stringify({ spam, toxic }) }
    }));
    const response = await submitComment(body);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { status } });
    expect(await host!.inspect.comments()).toMatchObject([{ status }]);
    expect(host!.http.requests()).toHaveLength(1);
  });

  it("holds a new comment for review when Workers AI returns an HTTP error", async () => {
    await host!.http.respond(aiUrl, new Response("Unavailable", { status: 503 }));
    const response = await submitComment();
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { status: "pending" } });
    expect(await host!.inspect.comments()).toMatchObject([{ status: "pending" }]);
    expect(host!.http.requests()).toHaveLength(1);
  });

  it("uses the fallback when Workers AI returns malformed classification JSON", async () => {
    await host!.http.respond(aiUrl, Response.json({ success: true, result: { response: "not JSON" } }));
    const response = await submitComment();
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { status: "pending" } });
    expect(await host!.inspect.comments()).toMatchObject([{ status: "pending" }]);
    expect(host!.http.requests()).toHaveLength(1);
  });

  it("falls back without making a network request when credentials are absent", async () => {
    await host!.fixtures.plugin.kv("settings:apiToken", "");
    const response = await submitComment();
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { status: "pending" } });
    expect(host!.http.requests()).toEqual([]);
  });

  it("approves an authenticated CMS user through fallback when Workers AI fails", async () => {
    await host!.fixtures.collection({
      slug: "articles", label: "Articles", commentsEnabled: true,
      commentsModeration: "all", commentsAutoApproveUsers: true
    });
    const post = await host!.fixtures.content("articles", { data: {}, status: "published" });
    const user = await host!.fixtures.user({ email: "member@example.com", name: "Member" });
    await host!.http.respond(aiUrl, new Response("Unavailable", { status: 503 }));
    const response = await host!.actions.comments.submit({
      collection: "articles", contentId: post.id, user,
      authorName: "Member", authorEmail: "member@example.com", body: "Thanks for this article."
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { status: "approved" } });
    expect(await host!.inspect.comments()).toMatchObject([{ status: "approved" }]);
    expect(host!.http.requests()).toHaveLength(1);
  });

  it("uses a custom model stored in canonical plugin settings", async () => {
    await host!.fixtures.plugin.setting("model", "@cf/custom/model");
    await host!.http.respond(
      "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/custom/model",
      Response.json({ success: true, result: { response: '{"spam":false,"toxic":true}' } })
    );
    const response = await submitComment();
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { status: "pending" } });
    expect(host!.http.requests()).toHaveLength(1);
    expect(host!.http.requests()[0].url).toContain("/ai/run/@cf/custom/model");
  });

  it("seeds the default model on install without overwriting a configured model", async () => {
    await host!.transport.invokeHook("plugin:install", { pluginId: host!.manifest.id });
    expect(await host!.inspect.setting("model")).toBe("@cf/meta/llama-3.1-8b-instruct");
    await host!.fixtures.plugin.setting("model", "@cf/custom/model");
    await host!.transport.invokeHook("plugin:install", { pluginId: host!.manifest.id });
    expect(await host!.inspect.setting("model")).toBe("@cf/custom/model");
  });
});
