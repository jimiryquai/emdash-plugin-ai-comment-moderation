# Files

- [Configuration and admin settings](configuration-and-settings.md) - The three admin settings that drive AI moderation, the encryption prerequisite for the API token, install-time default seeding, and what a host site must provide (sandbox runner and capabilities) for the plugin to run.
- [CI and release process](release-and-ci.md) - The four GitHub workflows guarding master, the release-to-npm trusted-publishing pipeline, and the human approval boundary that must be satisfied before anything is tagged or published.
- [Testing strategy](testing.md) - Two vitest projects verify the plugin — mocked unit tests that drive the exported functions and hooks directly, and workerd sandbox integration tests that run the built plugin through the production Cloudflare sandbox runner with HTTP stubbed only at the outbound boundary.
