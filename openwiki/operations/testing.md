---
type: operations
title: Testing strategy
description: Two vitest projects verify the plugin — mocked unit tests that drive the exported functions and hooks directly, and workerd sandbox integration tests that run the built plugin through the production Cloudflare sandbox runner with HTTP stubbed only at the outbound boundary.
tags: [testing, vitest, workerd, sandbox, integration]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-13T18:38:50.606Z
sources:
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-0657e9a63d10ecccef248304
    resource: repo://tests/moderation.test.ts
  - id: openwiki-source-f8a908d328a7238dc8d98f40
    resource: repo://tests/sandbox.test.ts
  - id: openwiki-source-fbadcd8591b65031efaaedce
    resource: repo://vitest.config.ts
generated: { by: "claude-code", at: "2026-11-13T18:38:50.606Z" }
---

# Testing strategy

## Two vitest projects

`vitest.config.ts` defines two projects, both run by plain `npx vitest run` (locally and in CI):

- **`unit`** — `tests/moderation.test.ts`, the original 23 mocked tests. No sandbox, no network: the plugin module is imported directly and driven with hand-rolled fakes.
- **`sandbox`** — `tests/sandbox.test.ts`, run with the `emdashPluginTest()` plugin from `@emdash-cms/plugin-test`. It executes the **built** plugin inside workerd through the production Cloudflare sandbox runner and `PluginBridge`.

Before the test plugin loads, the config sets `WRANGLER_SEND_METRICS = "false"`, disabling Wrangler telemetry locally and in CI.

## The unit layer (`tests/moderation.test.ts`)

A minimal fake world exercises the plugin's pure seams:

- `FakeKV` — a Map-backed settings/KV store;
- `FakeHttp` — records the last request and returns a programmable response (ok/status/json) or throws;
- `createFakeContext` — assembles these into a `PluginContext` double with no-op loggers;
- `createBaseEvent` — a default `CommentModerateEvent` (anonymous commenter, `first_time` moderation) with overrides.

Three suites build on this: `parseModerationResponse` parsing edge cases (clean JSON, fenced markdown blocks, first-braced-object extraction, missing/mistyped fields, extra fields ignored); `fallbackModeration` rule-by-rule decisions; and the `comment:moderate` hook integration (empty comment, missing credentials, verdict mapping, custom model URL, 10,000-character truncation, HTTP error and fetch-exception fallbacks, spam-beats-toxic precedence). A fourth suite pins `plugin:install` seeding behavior.

The fakes test the plugin's own logic only — EmDash's transport, settings encryption, and sandbox semantics are out of scope here.

## The sandbox layer (`tests/sandbox.test.ts`)

`createPluginRuntimeTestHost()` boots the real runtime. Each test:

1. provisions fixtures — a `posts` collection with comments enabled under `"all"` moderation, a published post, plugin settings KV (`test-account` / `test-token`), and where needed a second collection or a CMS user;
2. submits a comment through **EmDash's real comment submission action** (`host.actions.comments.submit`);
3. asserts on both the API result (201 + status in the payload) and the stored comment status (`host.inspect.comments()`).

Workers AI is stubbed **only at the outbound HTTP boundary** with `host.http.respond(aiUrl, Response.json(...))`: plugin functions and context are real. Unmatched HTTP requests fail locally instead of reaching Workers AI, so tests cannot leak onto the network. The suite verifies: clean → approved, spam → spam, toxic → pending (including the spam+toxic precedence case); HTTP 503 and malformed JSON both degrade to pending via fallback; absent credentials fall back with zero network requests; an authenticated CMS user with auto-approve is approved even when Workers AI errors; a custom model from canonical settings drives the request URL; and install seeding never overwrites a configured model. The settings test also asserts the secret contract (token never serialized back).

## What the tests do not cover

The suite does not verify a deployed site's runner bindings, real Workers AI classifications, or live credentials; no staging site is contacted. Those checks belong to the site's deployment work, not this package.

## Related pages

- [Comment moderation workflow](../workflows/comment-moderation.md) — the behavior these suites pin down.
- [Configuration and admin settings](configuration-and-settings.md) — the settings surface exercised by the sandbox tests.
- [CI and release process](release-and-ci.md) — where these suites gate merges and publishes.
