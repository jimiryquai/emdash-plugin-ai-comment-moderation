---
type: operations
title: Configuration and admin settings
description: The three admin settings that drive AI moderation, the encryption prerequisite for the API token, install-time default seeding, and what a host site must provide (sandbox runner and capabilities) for the plugin to run.
tags: [configuration, settings, secrets, installation, sandbox]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-13T18:38:50.606Z
sources:
  - id: openwiki-source-0deb758ff1c59b07bf51c2fb
    resource: repo://emdash-plugin.jsonc
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-e357d61069f3b66782c52ded
    resource: repo://src/plugin.ts
  - id: openwiki-source-f8a908d328a7238dc8d98f40
    resource: repo://tests/sandbox.test.ts
generated: { by: "claude-code", at: "2026-11-13T18:38:50.606Z" }
---

# Configuration and admin settings

## The settings schema

The manifest's `admin.settingsSchema` declares three keys, rendered on the plugin's page in the EmDash admin:

| Key | Type | Meaning |
| --- | --- | --- |
| `accountId` | `string` | Cloudflare account ID used in the Workers AI endpoint path. |
| `apiToken` | `secret` | Cloudflare API token with Workers AI access; EmDash encrypts it at rest. |
| `model` | `string` | Workers AI model; schema default `@cf/meta/llama-3.1-8b-instruct`. |

All three are read through `ctx.settings.get(...)` at moderation time (see [Cloudflare Workers AI integration](../architecture/workers-ai-integration.md)); `accountId` and `apiToken` are mandatory for the AI path — if either is missing, moderation falls back without any network request. A missing `model` falls back to the compile-time `DEFAULT_MODEL` constant, which equals the schema default.

## Secret encryption prerequisites

Because `apiToken` is declared `secret`, EmDash encrypts it at rest using the site's `EMDASH_ENCRYPTION_KEY`. That key must be configured on the site **before** a token is entered, and should be backed up in a secret manager separately from the database — losing it makes stored secrets unrecoverable.

Legacy note: a token saved before this schema was declared may still be stored in plaintext. Re-entering and saving it in the settings page encrypts it. The sandbox test asserts the modern behavior end-to-end: `updateSettings` returns `secretsSet: { apiToken: true }` and the serialized response never contains the raw token value.

## Install-time default seeding

The `plugin:install` hook seeds the default model, but only when nothing is stored:

```
model unset  -> settings.model = "@cf/meta/llama-3.1-8b-instruct"
model set    -> left untouched
```

This makes upgrades non-destructive: a site that configured `@cf/custom/model` keeps it across reinstall. Re-running install on a configured plugin is the case covered by both the unit test and the sandbox test.

## Site-side requirements

The plugin runs inside the EmDash plugin sandbox, so the consuming site must provide:

- **A sandbox runner** — e.g. `@emdash-cms/sandbox-workerd/sandbox` for Node.js sites (installed together with `workerd`), or the site's existing Cloudflare sandbox runner. Without a runner the plugin cannot execute.
- **Capability grants** — `network:request` (the outbound AI call) and `users:read` (registering the moderation hook), both declared in the manifest.
- **Host restriction** — network egress is limited to `api.cloudflare.com`.

The package is installed as a dependency and its default import goes straight into the `sandboxed` array of the EmDash astro integration; since 2.0.0 there is no named factory — the descriptor is the default export (see [Plugin structure and packaging](../architecture/plugin-structure.md)).

## Related pages

- [Plugin structure and packaging](../architecture/plugin-structure.md) — where the schema and capabilities are declared.
- [Cloudflare Workers AI integration](../architecture/workers-ai-integration.md) — how these settings are consumed at runtime.
- [Testing strategy](testing.md) — how settings behavior is verified in the sandbox.
