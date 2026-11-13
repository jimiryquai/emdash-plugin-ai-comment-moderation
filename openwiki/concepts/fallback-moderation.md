---
type: concept
title: Fallback moderation logic
description: The inline replica of EmDash's built-in 4-step moderation rules that the plugin defers to whenever Workers AI is unavailable, unconfigured, or unintelligible — and why it is replicated rather than imported.
tags: [fallback, moderation, failure-handling, emdash]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-13T18:38:50.606Z
sources:
  - id: openwiki-source-812e852d12e9cbe05c037dd4
    resource: repo://docs/plans/implementation_plan.md
  - id: openwiki-source-e357d61069f3b66782c52ded
    resource: repo://src/plugin.ts
  - id: openwiki-source-0657e9a63d10ecccef248304
    resource: repo://tests/moderation.test.ts
generated: { by: "claude-code", at: "2026-11-13T18:38:50.606Z" }
---

# Fallback moderation logic

## Responsibility

`fallbackModeration(event)` in `src/plugin.ts` is a pure function that reproduces EmDash's built-in default comment moderation as four ordered rules. It is the plugin's safety net: whenever the [Workers AI integration](../architecture/workers-ai-integration.md) cannot produce a verdict, the hook still returns a sane `ModerationDecision` and comment submission succeeds.

## The four ordered rules

Given a `CommentModerateEvent`, the rules are evaluated strictly in order; the first match wins:

1. **Authenticated CMS user** — if `collectionSettings.commentsAutoApproveUsers` is enabled and `comment.authorUserId` is set, the comment is `approved` with reason "Authenticated CMS user".
2. **Moderation disabled** — if `collectionSettings.commentsModeration === "none"`, the comment is `approved` with reason "Moderation disabled".
3. **Returning commenter** — if moderation is `"first_time"` and `event.priorApprovedCount > 0` (the commenter already has approved comments), the comment is `approved` with reason "Returning commenter".
4. **Default hold** — everything else is `pending` with reason "Held for review".

Note the ordering consequences: an authenticated CMS user is approved even under `"all"` moderation when auto-approve-users is on, and rule 3 only fires for `"first_time"` — under `"all"` a new anonymous comment always lands as `pending`.

## What triggers the fallback

The fallback runs (never throws) in every one of these situations, all inside `moderateWithAI`:

- `accountId` or `apiToken` is not configured in plugin settings — no network request is made at all;
- `ctx.http` is absent because the `network:request` capability was not granted;
- the Workers AI HTTP response has a non-ok status;
- `payload.result.response` is empty or missing;
- `parseModerationResponse` cannot extract boolean `spam`/`toxic` fields;
- the `ctx.http.fetch` call itself throws.

The empty-comment case is *not* a fallback: the hook returns `pending` directly before the AI path begins (see [Comment moderation workflow](../workflows/comment-moderation.md)).

## Why the logic is replicated inline

The plugin was extracted from a blog repository as a standalone package (see `docs/plans/implementation_plan.md`). The original plan preferred importing EmDash's own `defaultCommentModerate`, but that function lives in EmDash internals (`emdash/src/comments/moderator.ts`) and is not re-exported from the public API. Importing internals would break on EmDash updates, so the plan's fallback option was taken: replicate the roughly 15-line decision ladder inline. This keeps the plugin dependent only on the public `CommentModerateEvent`/`ModerationDecision` types and makes the behavior directly unit-testable (`fallbackModeration` is exported and covered by four focused tests in `tests/moderation.test.ts`).

The trade-off is drift risk: if EmDash changes its built-in ladder, this replica must be updated by hand. The `"first_time"`/`priorApprovedCount` semantics in particular mirror EmDash 1.4's behavior at the time of the 2.x line.

## Related pages

- [Comment moderation workflow](../workflows/comment-moderation.md) — where the fallback sits in the overall flow.
- [Cloudflare Workers AI integration](../architecture/workers-ai-integration.md) — the failure modes that hand off to this logic.
