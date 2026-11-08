# emdash-plugin-ai-comment-moderation

A sandboxed EmDash 1.4 plugin for comment moderation using Cloudflare Workers AI.

## Features

- **Spam & Toxicity Detection**: Analyzes comments to identify spam and toxic content.
- **KV-Driven Configuration**: Settings are stored in EmDash's Key-Value store. No environment variables required.
- **Fail-safe Fallback**: Replicates EmDash's built-in 4-step moderation logic if the Cloudflare AI is unavailable or unconfigured.

## Installation

Add the plugin to your `astro-blog` (or other EmDash-powered project):

```json
"dependencies": {
  "emdash-plugin-ai-comment-moderation": "^2.0.0"
}
```

In your `astro.config.mjs`:

```javascript
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import aiCommentModeration from "emdash-plugin-ai-comment-moderation";

export default defineConfig({
  // ...
  integrations: [
    emdash({
      sandboxed: [aiCommentModeration],
      sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",
      // ...
    })
  ]
});
```

This example uses the Node.js workerd runner. Install `@emdash-cms/sandbox-workerd` and `workerd`
in the site for Node.js, or keep your site's existing Cloudflare sandbox runner.
An available runner is required: see [EmDash's sandbox setup](https://docs.emdashcms.com/deployment/plugin-sandbox/).
The plugin needs `network:request` for Workers AI and `users:read` to register the
comment moderation hook. Network requests are restricted to `api.cloudflare.com`.

Version 2.0.0 drops EmDash 0.9 support: the peer range is `^1.4.0`, and the
old named factory import becomes the default descriptor shown above. The descriptor
and sandbox entry are built by the EmDash plugin CLI from `emdash-plugin.jsonc`
and `src/plugin.ts`; version lives only in `package.json`.

For local development, run `npm install` and `npm run build` here, then install
`file:../emdash-plugin-ai-comment-moderation` from your site.

## Configuration

Seed or set the following keys in your plugin's KV store:

- `settings:accountId`: Your Cloudflare Account ID.
- `settings:apiToken`: Your Cloudflare API Token (with access to Workers AI).
- `settings:model`: (Optional) The Cloudflare Workers AI model to run. Defaults to `@cf/meta/llama-3.1-8b-instruct` (seeded during installation).

In EmDash 1.4, `ctx.kv` keys starting with `settings:` read through the canonical
plugin settings store (with legacy KV fallback); writes go to settings. When
seeding with the test host, use `fixtures.plugin.setting("accountId", ...)`,
`fixtures.plugin.setting("apiToken", ...)`, and `fixtures.plugin.setting("model", ...)`.

## Moderation Logic

1. **Empty check**: Empty comments are automatically held as `pending`.
2. **AI Moderation**:
   - Queries Cloudflare Workers AI using the configured model.
   - Parses the JSON response for `{ spam: boolean, toxic: boolean }`.
   - Decisions:
     - `spam=true`: Marked as `spam`.
     - `toxic=true` (and not spam): Marked as `pending`.
     - Otherwise: Marked as `approved`.
   - The hook returns the raw decision (e.g. `AI: spam=false, toxic=false`) in
     `ModerationDecision.reason`. EmDash 1.4's isolated hook transport does not
     copy event metadata mutations back to the host, so this plugin cannot promise
     persisted AI reasons in the comment's moderation metadata.
3. **Fallback**: If AI credentials are not configured, the API fails, or parsing fails, the plugin falls back to EmDash's default 4-step logic:
   - Auto-approve if `commentsAutoApproveUsers` is enabled and user is authenticated.
   - Auto-approve if collection moderation is set to `"none"`.
   - Auto-approve if collection moderation is `"first_time"` and commenter is returning (has previous approved comments).
   - Otherwise, holds as `pending`.

## Development and tests

Use Node.js 22.23.4 or newer and npm. The npm lockfile is authoritative and is
committed for CI; the former pnpm lockfile has been removed.

```sh
npm install
npm run validate
npx tsc --noEmit
npx vitest run
npm run build
npm pack --dry-run
```

`tests/moderation.test.ts` retains the original 23 mocked unit tests.
`tests/sandbox.test.ts` uses `@emdash-cms/plugin-test@0.2.11` and runs the built
plugin inside workerd through the production Cloudflare sandbox runner and
`PluginBridge`. It submits comments through EmDash's real comment submission
action and checks both the API result and stored status: clean → approved,
spam → spam, toxic → pending. It also exercises AI failure fallback and install
configuration. Workers AI responses are stubbed only at the outbound HTTP
boundary using the runtime host's `http.respond`; plugin functions and context
are not mocked. Unmatched HTTP requests fail locally instead of reaching Workers AI.
Wrangler telemetry is disabled by the test configuration before loading its plugin.

The package's [source and testing guide](https://docs.emdashcms.com/plugins/creating-plugins/testing/)
confirm this is a real sandbox runner, so the ticket's conditional staging-script
fallback is unnecessary. These tests do not verify a deployed site's runner
bindings, real Workers AI classifications, or live credentials. No staging site
was contacted; a live staging check remains for the site's deployment work.

See [RELEASING.md](./RELEASING.md) for the npm release process and approval boundary.
