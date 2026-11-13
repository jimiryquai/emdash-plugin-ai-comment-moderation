---
type: workflow
title: Comment moderation workflow
description: The end-to-end comment:moderate flow — how the exclusive hook is registered, how empty comments short-circuit, how the AI verdict maps to comment status with spam taking precedence, and why AI reasons do not persist to comment metadata.
tags: [moderation, hooks, workflow, comments, emdash]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-13T15:09:12.734Z
sources:
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-e357d61069f3b66782c52ded
    resource: repo://src/plugin.ts
generated: { by: "claude-code", at: "2026-11-13T15:09:12.734Z" }
---

# Comment moderation workflow

## Entry point and hook policy

The plugin's entire runtime surface is one exclusive hook registration:

```ts
"comment:moderate": {
  exclusive: true,        // replaces any other moderator for this event
  errorPolicy: "abort",   // a hook failure aborts the surrounding operation
  timeout: 15000,         // 15s budget, sized for the outbound AI round trip
  handler: async (event, ctx) => { ... }
}
```

EmDash fires `comment:moderate` while processing a comment submission and expects a `ModerationDecision` (`{ status, reason }`) back. Because the hook is `exclusive`, installing this plugin makes it *the* moderator; because `errorPolicy` is `abort`, an unexpected throw would fail the submission — which is exactly why every failure path inside returns a decision instead of throwing (see below). The `users:read` capability exists to register this hook.

## Step 1 — empty-body short circuit

The handler trims `event.comment.body`. An empty (or whitespace-only) body returns immediately:

```
{ status: "pending", reason: "AI: Empty comment" }
```

with `event.metadata.ai_moderation = { error: "Empty comment" }`. No settings are read and no network call is made.

## Step 2 — AI verdict

<!-- openwiki: broken internal link [/openwiki/architecture/workers-ai-integration.md] link "/openwiki/architecture/workers-ai-integration.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [/openwiki/concepts/fallback-moderation.md] link "/openwiki/concepts/fallback-moderation.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
For a non-empty body the handler delegates to `moderateWithAI` ([Cloudflare Workers AI integration](/openwiki/architecture/workers-ai-integration.md)), which either produces an AI-grounded decision or hands off to the [fallback ladder](/openwiki/concepts/fallback-moderation.md) on any failure.

## Step 3 — decision mapping

The AI verdict `{ spam, toxic }` maps to comment status with **spam taking precedence**:

| `spam` | `toxic` | Resulting status | `reason` |
| --- | --- | --- | --- |
| true | any | `spam` | `AI: spam=true, toxic=…` |
| false | true | `pending` (held for review) | `AI: spam=false, toxic=true` |
| false | false | `approved` | `AI: spam=false, toxic=false` |

The raw classification is preserved verbatim in `ModerationDecision.reason` (e.g. `"AI: spam=false, toxic=false"`), so the admin comments panel shows which way the model leaned. Fallback decisions carry their own reasons ("Authenticated CMS user", "Moderation disabled", "Returning commenter", "Held for review").

## Metadata semantics — what does and does not persist

The handler writes the decision into `event.metadata.ai_moderation = { decision, reason }` before returning. However, **EmDash 1.4's isolated hook transport does not copy event metadata mutations back to the host**, so the plugin cannot promise these values persist into the comment's stored moderation metadata. The durable trace of an AI decision is the returned `reason` string, not the metadata object. Tests assert the metadata mutation at the unit level (where the event object is in-process) but deliberately make no persistence claim in the sandbox.

## Failure and ordering invariants

- Every branch returns a `ModerationDecision`; only an unexpected throw (a bug) would abort submission via `errorPolicy`.
- Empty-body handling precedes credential checks — an empty comment never triggers a network call.
- Spam beats toxic: a comment classified as both is filed as `spam`, not held.
- The 15s timeout bounds the whole handler, covering the AI round trip plus parsing.

<!-- openwiki: broken internal link [/openwiki/operations/testing.md] link "/openwiki/operations/testing.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
Representative coverage: `tests/moderation.test.ts` drives the handler directly for every row of the mapping table plus the empty and fallback paths; `tests/sandbox.test.ts` repeats the mapping through EmDash's real submission action (see [Testing strategy](/openwiki/operations/testing.md)).

## Related pages

<!-- openwiki: broken internal link [/openwiki/architecture/workers-ai-integration.md] link "/openwiki/architecture/workers-ai-integration.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Cloudflare Workers AI integration](/openwiki/architecture/workers-ai-integration.md) — how the verdict is produced.
<!-- openwiki: broken internal link [/openwiki/concepts/fallback-moderation.md] link "/openwiki/concepts/fallback-moderation.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Fallback moderation logic](/openwiki/concepts/fallback-moderation.md) — the decision returned when it is not.
<!-- openwiki: broken internal link [/openwiki/architecture/plugin-structure.md] link "/openwiki/architecture/plugin-structure.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Plugin structure and packaging](/openwiki/architecture/plugin-structure.md) — where the hook is declared.
