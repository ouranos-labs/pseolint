# @pseolint/action

The pseolint GitHub Action. Audits a build output directory or sitemap URL,
posts a summary comment on the PR, and fails the check when risk crosses a
threshold.

Usage and the full input/output table live in the [root README](../../README.md#github-action).

## Publishing to the GitHub Actions Marketplace

Marketplace lists only an `action.yml` at the **repository root**: *"Each
repository must contain a single action metadata file (`action.yml` or
`action.yaml`) at the root"*, and sub-folder metadata files *"will not be
automatically listed in the marketplace"*
([docs](https://docs.github.com/en/actions/creating-actions/publishing-actions-in-github-marketplace)).

So there are two copies of the metadata, and they must stay in step:

| File | Consumed as | `runs.main` |
| --- | --- | --- |
| `/action.yml` | `ouranos-labs/pseolint@<tag>` (Marketplace) | `packages/action/dist/index.js` |
| `packages/action/action.yml` | `ouranos-labs/pseolint/packages/action@action-v1` | `dist/index.js` |

`tests/action-metadata-parity.test.ts` fails the build if they diverge in
anything other than that path.

### Release steps

The action runs **straight from the committed bundle**: there is no build step
at consumer runtime, so a stale or missing `dist/` ships a stale or broken
action. Build and commit before tagging.

```bash
# 1. Build the bundle (ncc, from the repo root)
cd packages/core && bun run build
cd ../action && bun run build:ncc

# 2. Commit the rebuilt bundle
git add packages/action/dist
git commit -m "chore(action): rebuild bundle for <version>"

# 3. Tag and push
git tag v0.8.0
git push origin v0.8.0
```

Then on GitHub: open `/action.yml` on the tag, use the **Draft a release**
banner, tick *Publish this Action to the GitHub Marketplace*, and choose the
tag. The repository must be public, and you must have accepted the Marketplace
developer agreement.

Pushing a `v*` tag also triggers `.github/workflows/action-release.yml`, which
rebuilds and force-pushes `action.yml` + `dist/` to the `action-v1` orphan
branch. That branch serves consumers who want a moving ref; it is not what
Marketplace indexes.

### Checklist

- [ ] `packages/action/dist/index.js` rebuilt from current `src/` and committed
- [ ] `bun run test --filter='@pseolint/action'` passes (metadata parity)
- [ ] `runs.using` is a Node version GitHub still supports (`node24`)
- [ ] Root `action.yml` version-agnostic; the tag carries the version
- [ ] Repository is public
