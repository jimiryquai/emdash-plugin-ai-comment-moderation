import {
  definePlugin,
  type CommentModerateEvent,
  type ModerationDecision,
  type PluginContext
} from "emdash";

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const MAX_BODY_LENGTH = 10_000;

type ModerationOutput = {
  spam: boolean;
  toxic: boolean;
};

type CloudflareAIResponse = {
  success?: boolean;
  result?: {
    response?: string;
  };
};

export function parseModerationResponse(raw: string): ModerationOutput | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ModerationOutput>;
    if (typeof parsed.spam === "boolean" && typeof parsed.toxic === "boolean") {
      return { spam: parsed.spam, toxic: parsed.toxic };
    }
  } catch {
    const fencedJson = raw.match(/\{[\s\S]*?\}/);
    if (fencedJson) {
      try {
        const parsed = JSON.parse(fencedJson[0]) as Partial<ModerationOutput>;
        if (typeof parsed.spam === "boolean" && typeof parsed.toxic === "boolean") {
          return { spam: parsed.spam, toxic: parsed.toxic };
        }
      } catch {
        // ignore parsing failure
      }
    }
  }
  return null;
}

export function fallbackModeration(event: CommentModerateEvent): ModerationDecision {
  const { comment, collectionSettings, priorApprovedCount } = event;

  // 1. Auto-approve authenticated CMS users if configured
  if (collectionSettings.commentsAutoApproveUsers && comment.authorUserId) {
    return { status: "approved", reason: "Authenticated CMS user" };
  }

  // 2. If moderation is "none" → approved
  if (collectionSettings.commentsModeration === "none") {
    return { status: "approved", reason: "Moderation disabled" };
  }

  // 3. If moderation is "first_time" and returning commenter → approved
  if (collectionSettings.commentsModeration === "first_time" && priorApprovedCount > 0) {
    return { status: "approved", reason: "Returning commenter" };
  }

  // 4. Otherwise → pending
  return { status: "pending", reason: "Held for review" };
}

async function moderateWithAI(
  body: string,
  ctx: PluginContext,
  event: CommentModerateEvent
): Promise<ModerationDecision> {
  const accountId = await ctx.kv.get<string>("settings:accountId");
  const apiToken = await ctx.kv.get<string>("settings:apiToken");
  const model = (await ctx.kv.get<string>("settings:model")) || DEFAULT_MODEL;

  if (!accountId || !apiToken) {
    ctx.log.warn("Cloudflare AI accountId or apiToken not configured. Falling back to default moderator.");
    return fallbackModeration(event);
  }

  if (!ctx.http) {
    ctx.log.error("HTTP access capability not available in plugin context. Falling back to default moderator.");
    return fallbackModeration(event);
  }

  try {
    const truncatedBody = body.length > MAX_BODY_LENGTH ? body.substring(0, MAX_BODY_LENGTH) : body;

    const response = await ctx.http.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                'You are a moderation bot. Analyze the comment and decide if it is spam or toxic. Return strictly JSON: {"spam": boolean, "toxic": boolean}.'
            },
            {
              role: "user",
              content: truncatedBody
            }
          ]
        })
      }
    );

    if (!response.ok) {
      ctx.log.warn(`AI moderation request failed with status ${response.status}. Falling back to default moderator.`);
      return fallbackModeration(event);
    }

    const payload = (await response.json()) as CloudflareAIResponse;
    const rawOutput = payload?.result?.response;
    if (!rawOutput) {
      ctx.log.warn("Empty response from Cloudflare AI. Falling back to default moderator.");
      return fallbackModeration(event);
    }

    const aiResult = parseModerationResponse(rawOutput);
    if (!aiResult) {
      ctx.log.warn("Failed to parse Cloudflare AI moderation response. Falling back to default moderator.");
      return fallbackModeration(event);
    }

    const reason = `AI: spam=${aiResult.spam}, toxic=${aiResult.toxic}`;
    if (aiResult.spam) {
      return { status: "spam", reason };
    }
    if (aiResult.toxic) {
      return { status: "pending", reason };
    }
    return { status: "approved", reason };
  } catch (error) {
    ctx.log.error("AI moderation request encountered an error. Falling back to default moderator.", {
      error: error instanceof Error ? error.message : String(error)
    });
    return fallbackModeration(event);
  }
}

export default definePlugin({
  hooks: {
    "plugin:install": {
      handler: async (_event: Record<string, never>, ctx: PluginContext) => {
        const existingModel = await ctx.kv.get<string>("settings:model");
        if (!existingModel) {
          await ctx.kv.set("settings:model", DEFAULT_MODEL);
        }
      }
    },
    "comment:moderate": {
      exclusive: true,
      errorPolicy: "abort",
      timeout: 15000,
      handler: async (event: CommentModerateEvent, ctx: PluginContext): Promise<ModerationDecision> => {
        const body = event.comment.body?.trim();

        if (!body) {
          event.metadata.ai_moderation = { error: "Empty comment" };
          return { status: "pending", reason: "AI: Empty comment" };
        }

        const decision = await moderateWithAI(body, ctx, event);
        event.metadata.ai_moderation = {
          decision: decision.status,
          reason: decision.reason
        };
        return decision;
      }
    }
  }
});
