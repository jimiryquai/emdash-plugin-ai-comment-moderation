---
type: quickstart
title: Quickstart
description: What emdash-plugin-ai-comment-moderation is, how to set up a development environment and verify it locally, and which wiki page to read for each task.
tags: [quickstart, overview, development, routing]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-13T15:09:12.734Z
sources:
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-e357d61069f3b66782c52ded
    resource: repo://src/plugin.ts
generated: { by: "claude-code", at: "2026-11-13T15:09:12.734Z" }
---

# Quickstart

## What this is

`emdash-plugin-ai-comment-moderation` (v2.1.x) is a sandboxed EmDash 1.4 plugin that moderates blog comments with Cloudflare Workers AI: spam is filed as `spam`, toxic content is held as `pending`, clean comments are `approved`, and any AI failure degrades gracefully to EmDash's built-in 4-step moderation. The whole plugin is one file, `src/plugin.ts`, declared by `emdash-plugin.jsonc` and built into `dist/` by the EmDash plugin CLI.

## Local development

Requires Node.js 22.23.4+ and npm (the committed `package-lock.json` is authoritative; there is no pnpm lockfile):

```sh
npm install
npm run validate        # emdash-plugin validate — manifest + build coherence
npx tsc --noEmit        # typecheck
npx vitest run          # unit + workerd sandbox suites
npm run build           # build dist/ artifacts
npm pack --dry-run      # inspect the publishable tarball
```

To try it in a real site, `npm run build` here, then install `file:../emdash-plugin-ai-comment-moderation` from the site and wire it up:

```js
integrations: [
  emdash({
    sandboxed: [aiCommentModeration],           // default import; no factory call
    sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox", // a runner is mandatory
  })
]
```

The plugin needs `network:request` (Workers AI, restricted to `api.cloudflare.com`) and `users:read` (hook registration) — both declared in the manifest. Admin-side, set the Cloudflare account ID and API token on the plugin's settings page after configuring the site's `EMDASH_ENCRYPTION_KEY`.

## Task routing

| Task | Read |
| --- | --- |
<!-- openwiki: broken internal link [/openwiki/workflows/comment-moderation.md] link "/openwiki/workflows/comment-moderation.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Understand how a comment flows from submission to status | [Comment moderation workflow](/openwiki/workflows/comment-moderation.md) |
<!-- openwiki: broken internal link [/openwiki/architecture/workers-ai-integration.md] link "/openwiki/architecture/workers-ai-integration.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Work on the Workers AI request, prompt, or response parsing | [Cloudflare Workers AI integration](/openwiki/architecture/workers-ai-integration.md) |
<!-- openwiki: broken internal link [/openwiki/concepts/fallback-moderation.md] link "/openwiki/concepts/fallback-moderation.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Understand the no-AI / failure behavior | [Fallback moderation logic](/openwiki/concepts/fallback-moderation.md) |
<!-- openwiki: broken internal link [/openwiki/operations/configuration-and-settings.md] link "/openwiki/operations/configuration-and-settings.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Change settings, secrets, or install seeding | [Configuration and admin settings](/openwiki/operations/configuration-and-settings.md) |
<!-- openwiki: broken internal link [/openwiki/operations/testing.md] link "/openwiki/operations/testing.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Add or modify tests | [Testing strategy](/openwiki/operations/testing.md) |
<!-- openwiki: broken internal link [/openwiki/operations/release-and-ci.md] link "/openwiki/operations/release-and-ci.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Cut a release or touch CI | [CI and release process](/openwiki/operations/release-and-ci.md) |
<!-- openwiki: broken internal link [/openwiki/architecture/plugin-structure.md] link "/openwiki/architecture/plugin-structure.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Packaging, exports, manifest, versioning | [Plugin structure and packaging](/openwiki/architecture/plugin-structure.md) |

## Ground rules

- Repository docs (README, RELEASING.md) are evidence of intent; `src/plugin.ts`, `emdash-plugin.jsonc`, and the tests are the source of truth for behavior.
<!-- openwiki: broken internal link [/openwiki/operations/release-and-ci.md] link "/openwiki/operations/release-and-ci.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- Publishing is approval-gated: nothing is tagged or released without James's sign-off (see [CI and release process](/openwiki/operations/release-and-ci.md)).
- Docs questions about EmDash itself can be answered through the `emdash-docs` MCP server configured in `config/mcporter.json`.
