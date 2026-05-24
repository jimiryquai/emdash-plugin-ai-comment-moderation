# emdash-plugin-ai-comment-moderation

An EmDash plugin for comment moderation using Cloudflare Workers AI.

## Features

- **Spam & Toxicity Detection**: Analyzes comments to identify spam and toxic content.
- **KV-Driven Configuration**: Settings are stored in EmDash's Key-Value store. No environment variables required.
- **Fail-safe Fallback**: Replicates EmDash's built-in 4-step moderation logic if the Cloudflare AI is unavailable or unconfigured.

## Installation

Add the plugin to your `astro-blog` (or other EmDash-powered project):

```json
"dependencies": {
  "emdash-plugin-ai-comment-moderation": "file:../emdash-plugin-ai-comment-moderation"
}
```

In your `astro.config.mjs`:

```javascript
import { emdash } from "emdash/astro";
import { aiCommentModerationPlugin } from "emdash-plugin-ai-comment-moderation";

export default defineConfig({
  // ...
  integrations: [
    emdash({
      plugins: [aiCommentModerationPlugin()],
      // ...
    })
  ]
});
```

## Configuration

Seed or set the following keys in your plugin's KV store:

- `settings:accountId`: Your Cloudflare Account ID.
- `settings:apiToken`: Your Cloudflare API Token (with access to Workers AI).
- `settings:model`: (Optional) The Cloudflare Workers AI model to run. Defaults to `@cf/meta/llama-3.1-8b-instruct` (seeded during installation).

## Moderation Logic

1. **Empty check**: Empty comments are automatically held as `pending`.
2. **AI Moderation**:
   - Queries Cloudflare Workers AI using the configured model.
   - Parses the JSON response for `{ spam: boolean, toxic: boolean }`.
   - Decisions:
     - `spam=true`: Marked as `spam`.
     - `toxic=true` (and not spam): Marked as `pending`.
     - Otherwise: Marked as `approved`.
   - The raw decision (e.g. `AI: spam=false, toxic=false`) is saved in the moderation `reason`.
3. **Fallback**: If AI credentials are not configured, the API fails, or parsing fails, the plugin falls back to EmDash's default 4-step logic:
   - Auto-approve if `commentsAutoApproveUsers` is enabled and user is authenticated.
   - Auto-approve if collection moderation is set to `"none"`.
   - Auto-approve if collection moderation is `"first_time"` and commenter is returning (has previous approved comments).
   - Otherwise, holds as `pending`.
