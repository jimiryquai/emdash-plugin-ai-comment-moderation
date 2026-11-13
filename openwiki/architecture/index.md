# Files

- [Plugin structure and packaging](plugin-structure.md) - How the AI Comment Moderation plugin is assembled from its manifest, a single TypeScript source file, and CLI-generated dist artifacts, and how its package exports, capability surface, and versioning rules fit together.
- [Cloudflare Workers AI integration](workers-ai-integration.md) - The outbound moderation call to Cloudflare Workers AI — endpoint construction, authentication, prompt shape, body truncation, response unwrapping, and the tolerant parser that turns model output into a spam/toxic verdict.
