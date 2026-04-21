# @pseolint/core

## 0.2.2

### Patch Changes

- fix(publish): rewrite `workspace:*` to real semver in published dependencies

  The 0.2.1 tarballs shipped with `workspace:*` in their `dependencies` lists, which npm cannot resolve. Any `npx pseolint` or `npm install pseolint` silently failed. Republishing via `changeset publish` rewrites the workspace protocol to the real version range.
