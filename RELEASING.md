# Releasing

This plugin auto-publishes to npm when a GitHub release is created.

## Steps

1. **Bump the version**

   ```bash
   npm version patch   # bug fix: 1.0.0 → 1.0.1
   npm version minor   # new feature: 1.0.0 → 1.1.0
   npm version major   # breaking change: 1.0.0 → 2.0.0
   ```

   This updates `package.json` and creates a git tag automatically.

2. **Push the commit and tag**

   ```bash
   git push && git push --tags
   ```

3. **Create a GitHub release**

   ```bash
   gh release create v1.0.1 --generate-notes
   ```

   Or via the [GitHub UI](https://github.com/jimiryquai/emdash-plugin-ai-comment-moderation/releases/new).

4. **Done** — the `publish.yml` workflow picks up the release and runs `npm publish` automatically.

## Verify

- Check the [Actions tab](https://github.com/jimiryquai/emdash-plugin-ai-comment-moderation/actions) for the publish workflow run.
- Confirm on [npmjs.com](https://www.npmjs.com/package/emdash-plugin-ai-comment-moderation) that the new version is live.
