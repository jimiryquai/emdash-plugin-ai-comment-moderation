# Releasing

This plugin auto-publishes to npm when a GitHub release is created.

## Steps

Release preparation ends with an open pull request against `master`, passing CI,
and James's approval pending. Do not tag, publish a GitHub release, or run
`npm publish` until James approves publishing. A published GitHub release triggers
the npm publish workflow automatically.

The EmDash 1.4 migration is **2.0.0**: raising the peer dependency from `^0.9.0`
to `^1.4.0` removes supported consumers, and installation now uses a default
descriptor in `sandboxed` rather than the old named factory. Both are breaking.

Commit `package-lock.json`; npm is the CI package manager. `package.json` is the
only version source; the CLI derives the descriptor and runtime manifest from it.
The publish job installs dependencies and runs validation, typechecking, and tests;
`prepack` builds the distributable `dist/` files before npm packs the release.

James chose MIT on 2026-11-08; the package and manifest declare MIT, with the
full grant in `LICENSE`. Its publisher field is the site domain `jamesryan.dev`;
Atmosphere account ownership has not been checked. npm
distribution does not use it; confirm the publisher before any future registry release.

Only after publish approval:

1. **Bump the version**

   ```bash
   npm version patch   # bug fix: 1.0.0 → 1.0.1
   npm version minor   # new feature: 1.0.0 → 1.1.0
   npm version major   # breaking change: 1.0.0 → 2.0.0
   ```

   This updates `package.json` and creates a git tag automatically. If the release
   PR already bumped the version, do not bump it again: tag the approved commit instead.

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
