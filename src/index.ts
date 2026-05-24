import type { PluginDescriptor } from "emdash";

export function aiCommentModerationPlugin(): PluginDescriptor {
  return {
    id: "ai-comment-moderation",
    version: "1.0.0",
    format: "standard",
    entrypoint: "emdash-plugin-ai-comment-moderation/sandbox",
    capabilities: ["network:request", "users:read"],
    allowedHosts: ["api.cloudflare.com"]
  };
}
