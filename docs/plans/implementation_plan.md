# Extract & Rewrite AI Comment Moderation Plugin

Extract `src/plugins/ai-comment-moderation` from the blog repo into a standalone npm package (`emdash-plugin-ai-comment-moderation`) with corrected moderation logic, proper EmDash integration, and sandbox compatibility.

## Decisions Summary

| Decision | Choice |
|---|---|
| Scope | `comment:moderate` hook only |
| AI Provider | Cloudflare Workers AI only |
| Model | Configurable via KV (default: `@cf/meta/llama-3.1-8b-instruct`) |
| Config surface | All settings in `ctx.kv` (seeded on `plugin:install`) |
| Moderation taxonomy | Spam + toxicity (replaces sentiment) |
| AI unavailable fallback | Fall through to EmDash's built-in default moderator logic |
| Admin UI | None for v1 |
| Packaging | Standalone npm package, standard plugin format |
| Repo | `~/Repos/emdash-plugin-ai-comment-moderation` → GitHub `jimiryquai/emdash-plugin-ai-comment-moderation` |
| Metadata | Attach raw AI classification to `ModerationDecision.reason` |

---

## Proposed Changes

### New Package: `emdash-plugin-ai-comment-moderation`

Scaffold a new package at `~/Repos/emdash-plugin-ai-comment-moderation` with the standard EmDash plugin structure.

#### [NEW] package.json

Standard npm package with:
- `name`: `emdash-plugin-ai-comment-moderation`
- `type`: `module`
- `exports`: `"."` → `./src/index.ts`, `"./sandbox"` → `./src/sandbox-entry.ts`
- `peerDependencies`: `emdash: "^0.1.0"`

#### [NEW] tsconfig.json

Standard TypeScript config for ESM.

#### [NEW] src/index.ts

Plugin descriptor factory. Changes from current:
- `entrypoint` → `"emdash-plugin-ai-comment-moderation/sandbox"` (proper npm path, not local file path)
- `capabilities` → `["network:request", "users:read"]` (use current names, not deprecated `network:fetch` alias)
- `allowedHosts` → `["api.cloudflare.com"]`
- No constructor options (all config in KV)

#### [NEW] src/sandbox-entry.ts

Plugin implementation. Major changes from current:

1. **No `process.env`** — read credentials from `ctx.kv` (`settings:accountId`, `settings:apiToken`, `settings:model`)
2. **Spam + toxicity taxonomy** — prompt asks for `{ spam: boolean, toxic: boolean }` instead of `{ spam: boolean, sentiment: string }`
3. **Fallback to default moderator** — when AI is unavailable (missing credentials, API error, parse failure), import and call `defaultCommentModerate` from `emdash` to apply the built-in 4-step logic
4. **Richer reason strings** — include AI classification detail in the `reason` field (e.g. `"AI: spam=false, toxic=true"`)
5. **`plugin:install` hook** — seed default KV settings (model name)

> **IMPORTANT:** The fallback to `defaultCommentModerate` requires importing from `emdash` internals (`emdash` exports `CommentModerateEvent` and `ModerationDecision` from its public API, but `defaultCommentModerate` is from `emdash/src/comments/moderator.ts`). We need to check if this function is re-exported from the public API. If not, we'll replicate the 4-step logic inline — it's only ~15 lines.

#### [NEW] README.md

Documentation covering installation, configuration (KV keys), how moderation works, and the fallback behaviour.

---

### Blog Repo: `astro-blog`

#### [DELETE] src/plugins/ai-comment-moderation/

Remove the entire local plugin directory.

#### [MODIFY] astro.config.mjs

- Change import from `"./src/plugins/ai-comment-moderation/index"` → `"emdash-plugin-ai-comment-moderation"`
- The function name stays `aiCommentModerationPlugin()`

---

## Open Questions

> **IMPORTANT: `defaultCommentModerate` export path.** The built-in default moderator lives at `emdash/src/comments/moderator.ts`. Is it exported from emdash's public API? If not, we have two options:
> 1. Replicate the 4-step logic inline (simple, no external dependency on internals)
> 2. Import from internal path (fragile, could break on emdash updates)
>
> Will check the emdash exports during implementation and go with option 1 if it's not publicly exported.

## Verification Plan

### Automated Tests
- `npx tsc --noEmit` in the plugin repo to verify types compile
- `npm link` the plugin into the blog, run `npx emdash dev`, and verify the dev server starts without errors

### Manual Verification
- Submit a test comment on a blog post and verify the moderation hook fires
- Test AI unavailable fallback by using an invalid API token
- Check that moderation decisions appear correctly in the EmDash admin comments panel
