---
type: operations
title: CI and release process
description: The four GitHub workflows guarding master, the release-to-npm trusted-publishing pipeline, and the human approval boundary that must be satisfied before anything is tagged or published.
tags: [ci, github-actions, npm, release, publishing]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-13T18:38:50.606Z
sources:
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-f2608d0d515da097485b6ec5
    resource: repo://.github/workflows/publish.yml
  - id: openwiki-source-f511aae758ec5d25a9f8719a
    resource: repo://.github/workflows/security.yml
  - id: openwiki-source-4f2678f93d3fd3835f9f2909
    resource: repo://.github/workflows/test.yml
  - id: openwiki-source-a040dd20ede532da30b5abc0
    resource: repo://RELEASING.md
generated: { by: "claude-code", at: "2026-11-13T18:38:50.606Z" }
---

# CI and release process

## CI workflows on push and pull request

Three workflows run against `master` pushes and pull requests:

- **`ci.yml` (CI)** — `npm ci`, then `npx tsc --noEmit`, `npm run validate` (EmDash plugin validation), `npm run build`, and `npm pack --dry-run`. This is the gate that the manifest, types, and distributables are coherent.
- **`test.yml` (Test)** — `npm ci` + `npx vitest run`, covering both the unit project and the workerd sandbox project (see [Testing strategy](testing.md)).
- **`security.yml` (Security)** — `npm audit --audit-level=high --omit=dev`, run on pushes, all PRs, and a weekly Monday 06:00 UTC schedule.

## Publishing pipeline (`publish.yml`)

Publishing is triggered by a **published GitHub release**, not by pushes. The job:

1. checks out and installs with `npm ci` on Node 22;
2. re-runs validation, typechecking, and the full vitest suite;
3. upgrades npm to **11.21.1** before publishing — trusted publishing (OIDC) needs npm 11.5.1 or later, and Node 22 bundles npm 10, which never attempts the OIDC login and gets a 404 from the registry;
4. runs `npm publish --provenance --access public` with `id-token: write` permissions.

`prepack` in `package.json` runs the build first, so the tarball always contains freshly built `dist/` artifacts (see [Plugin structure and packaging](../architecture/plugin-structure.md)).

## The approval boundary

RELEASING.md defines the human gate: a release ends with an open pull request against `master`, CI passing, and **James's approval pending**. Until that approval:

- do not tag,
- do not publish a GitHub release,
- do not run `npm publish`.

The workflow chain is deliberate: approval → `npm version` bump (patch/minor/major; skip if the release PR already bumped) → push commit and tag → `gh release create` → `publish.yml` publishes automatically. Verification is checking the Actions tab for the publish run and npmjs.com for the live version.

Operational notes recorded with the process: the npm lockfile is authoritative and committed (CI's package manager is npm); `package.json` is the only version source; the licence is MIT (chosen 2026-11-08) with publisher field `jamesryan.dev`, and the Atmosphere account ownership of that publisher has not been checked — confirm it before any future registry release.

## Related pages

- [Plugin structure and packaging](../architecture/plugin-structure.md) — what `validate`/`build` produce and what gets packed.
- [Testing strategy](testing.md) — the suites the CI and publish jobs run.
- [Quickstart](../quickstart.md) — local equivalents of the CI checks.
