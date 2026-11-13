---
type: architecture
title: Cloudflare Workers AI integration
description: The outbound moderation call to Cloudflare Workers AI — endpoint construction, authentication, prompt shape, body truncation, response unwrapping, and the tolerant parser that turns model output into a spam/toxic verdict.
tags: [workers-ai, cloudflare, http, parsing, moderation]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-13T18:38:50.606Z
sources:
  - id: openwiki-source-e357d61069f3b66782c52ded
    resource: repo://src/plugin.ts
generated: { by: "claude-code", at: "2026-11-13T18:38:50.606Z" }
---

# Cloudflare Workers AI integration

## Responsibility

`moderateWithAI` in `src/plugin.ts` owns every aspect of talking to Cloudflare Workers AI: reading credentials from plugin settings, building and authorizing the request, keeping the payload bounded, and coercing the model's free-text answer into a strict `{ spam, toxic }` verdict. It is called only from the `comment:moderate` hook (see [Comment moderation workflow](../workflows/comment-moderation.md)); on any failure it defers to the [fallback moderator](../concepts/fallback-moderation.md) rather than throwing.

## Endpoint and authentication

The request targets the Workers AI REST run endpoint:

```
POST https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run/{model}
Authorization: Bearer {apiToken}
Content-Type: application/json
```

- `accountId` and `apiToken` come from `ctx.settings` (the admin-configured values; see [Configuration and admin settings](../operations/configuration-and-settings.md)). If either is unset, the function logs a warning and returns the fallback decision **without any network call**.
- `model` comes from settings too, defaulting to `@cf/meta/llama-3.1-8b-instruct` when unset.
- The call goes through `ctx.http.fetch`, the sandbox-brokered HTTP client granted by the `network:request` capability. If `ctx.http` is absent (capability not granted), the function logs an error and falls back.
- The host allowlist in the manifest permits exactly `api.cloudflare.com`, so the sandbox would reject any other destination.

## Prompt shape and body truncation

The JSON body is a two-message chat completion:

- **system**: "You are a moderation bot. Analyze the comment and decide if it is spam or toxic. Return strictly JSON: {\"spam\": boolean, \"toxic\": boolean}."
- **user**: the comment body, truncated to `MAX_BODY_LENGTH = 10_000` characters (`body.substring(0, 10000)`) so an oversized comment cannot inflate request cost or trip size limits.

The unit test for truncation asserts the user message is exactly 10,000 characters for a 20,000-character body.

## Response envelope and tolerant parsing

Workers AI wraps the model's answer in a v4 envelope: `{ success, result: { response: "<model text>" } }`. The plugin unwraps `payload.result.response`; an empty or missing `response` triggers the fallback with a warning log.

Because instruction-following models sometimes decorate their JSON, `parseModerationResponse` (exported for direct unit testing) accepts the model text in either of two forms:

1. **Direct parse**: `JSON.parse(raw)` when the whole string is already JSON.
2. **First braced object**: on a parse failure, a lazy regex `\{[\s\S]*?\}` extracts the first `{...}` block (e.g. from a fenced ```` ```json ```` block or surrounding prose) and parses that.

In both paths the result is only accepted when `spam` and `toxic` are both present and boolean; any other shape (missing keys, string values, whitespace-only input) returns `null`, which the caller treats as a parse failure and falls back. Extra fields in the JSON are ignored. A `null` return never throws — parsing errors are swallowed deliberately.

## Failure behavior

Every failure mode converges on the same contract: log (warn for expected degradation, error for the exception path) and return `fallbackModeration(event)`:

| Condition | Log level | Network attempted |
| --- | --- | --- |
| `accountId`/`apiToken` unset | warn | no |
| `ctx.http` missing | error | no |
| HTTP response not `ok` | warn | yes |
| empty `result.response` | warn | yes |
| unparseable model output | warn | yes |
| `fetch` throws | error | yes |

This is what makes the plugin fail-safe: a Cloudflare outage, a bad token, or a chatty model degrades the site to EmDash's built-in moderation semantics instead of blocking comment submission.

## Related pages

- [Comment moderation workflow](../workflows/comment-moderation.md) — the hook that invokes this integration and maps the verdict to comment status.
- [Fallback moderation logic](../concepts/fallback-moderation.md) — the decision returned on every failure above.
- [Configuration and admin settings](../operations/configuration-and-settings.md) — where `accountId`, `apiToken`, and `model` come from.
