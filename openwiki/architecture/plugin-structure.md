---
type: architecture
title: Plugin structure and packaging
description: How the AI Comment Moderation plugin is assembled from its manifest, a single TypeScript source file, and CLI-generated dist artifacts, and how its package exports, capability surface, and versioning rules fit together.
tags: [plugin, packaging, manifest, exports, emdash]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-13T15:09:12.734Z
sources:
  - id: openwiki-source-ea70eb6c045047448e446296
    resource: repo://.gitignore
  - id: openwiki-source-0deb758ff1c59b07bf51c2fb
    resource: repo://emdash-plugin.jsonc
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-e357d61069f3b66782c52ded
    resource: repo://src/plugin.ts
generated: { by: "claude-code", at: "2026-11-13T15:09:12.734Z" }
---

# Plugin structure and packaging

## Responsibility

`emdash-plugin-ai-comment-moderation` is a standalone npm package that ships a sandboxed EmDash 1.4 plugin. Its entire runtime behavior lives in one file, `src/plugin.ts`, which registers two hooks (`plugin:install` and `comment:moderate`) and exports two pure helpers (`parseModerationResponse`, `fallbackModeration`) that the unit tests drive directly. Everything else in the repository exists to declare, build, test, or publish that plugin.

## Manifest (`emdash-plugin.jsonc`)

The manifest is the plugin's declaration to EmDash and the build CLI:

- **Identity**: slug `ai-comment-moderation`, publisher `jamesryan.dev`, display name "AI Comment Moderation", MIT license, repo/security URLs pointing at `jimiryquai/emdash-plugin-ai-comment-moderation`.
- **Capabilities**: `network:request` (for the outbound Workers AI call) and `users:read` (to register the comment moderation hook). The sandbox denies anything not declared here.
- **Allowed hosts**: network requests are restricted to `api.cloudflare.com` only.
<!-- openwiki: broken internal link [/openwiki/operations/configuration-and-settings.md] link "/openwiki/operations/configuration-and-settings.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- **Admin settings schema**: declares the three settings keys (`accountId`, `apiToken` as a secret, `model` with a default) rendered on the plugin's EmDash settings page (see [Configuration and admin settings](/openwiki/operations/configuration-and-settings.md)).
- **Storage**: empty — the plugin persists nothing of its own beyond settings.

## Source layout and build artifacts

The repository keeps a deliberately small surface:

```
emdash-plugin.jsonc   manifest (identity, capabilities, settings schema)
src/plugin.ts         the whole plugin: helpers + hook handlers
tests/                unit tests and workerd sandbox tests
```

There is no handwritten `src/index.ts` descriptor or sandbox entry. The `@emdash-cms/plugin-cli` dev dependency (invoked through the `validate` and `build` npm scripts) derives both distributables from the manifest and `src/plugin.ts`:

- `dist/index.mjs` — the plugin descriptor imported from package entry `.`;
- `dist/plugin.mjs` — the sandbox entry imported from the subpath `./sandbox`.

`dist/` is git-ignored; `prepack` runs the build so `npm pack` always packs freshly built files. The npm tarball ships only `dist/`, `emdash-plugin.jsonc`, and `README.md` (the `files` field).

## Versioning and compatibility

The version lives only in `package.json` (currently 2.1.0); the CLI derives the descriptor and runtime manifest from it, so no other file duplicates the version. The peer dependency is `emdash: ^1.4.0`. Version 2.0.0 was the EmDash 1.4 migration and is deliberately breaking: it raised the peer range from `^0.9.0` and replaced the old named factory import with the default descriptor consumers now place directly in the `sandboxed` array of their EmDash integration.

## Consumer integration

A host site installs the package and lists the default import in the `sandboxed` array of its EmDash astro integration, together with a `sandboxRunner` (for example `@emdash-cms/sandbox-workerd/sandbox` on Node.js). A working runner is mandatory: the plugin's code executes inside the sandbox, not in the site process. The declared capabilities and host restriction are what the sandbox enforces on its behalf.

## TypeScript configuration

`tsconfig.json` targets ES2022 with `module: ESNext`, `moduleResolution: bundler`, and `strict` mode; it type-checks `src`, `tests`, and `vitest.config.ts` with declarations and source maps emitted to `dist/`. `npm run typecheck` (`tsc --noEmit`) is the CI gate.

## Related pages

<!-- openwiki: broken internal link [/openwiki/workflows/comment-moderation.md] link "/openwiki/workflows/comment-moderation.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Comment moderation workflow](/openwiki/workflows/comment-moderation.md) — what the hooks declared here actually do.
<!-- openwiki: broken internal link [/openwiki/operations/configuration-and-settings.md] link "/openwiki/operations/configuration-and-settings.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Configuration and admin settings](/openwiki/operations/configuration-and-settings.md) — the settings schema rendered from this manifest.
<!-- openwiki: broken internal link [/openwiki/operations/release-and-ci.md] link "/openwiki/operations/release-and-ci.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [CI and release process](/openwiki/operations/release-and-ci.md) — how these artifacts are validated and published.
