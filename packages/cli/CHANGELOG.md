# pseolint

## 0.2.3

### Patch Changes

- fix(cli): run when the installed binary is a symlink (`npm link`, Windows global shim)

  The direct-run guard compared `import.meta.url` to a URL built from `process.argv[1]`, which diverges when the real file lives on another path (symlink/junction). The process exited 0 without running any command, including `--version` and audits.

- fix(publish): rewrite `workspace:*` to real semver in published dependencies

  The 0.2.1 tarballs shipped with `workspace:*` in their `dependencies` lists, which npm cannot resolve. Any `npx pseolint` or `npm install pseolint` silently failed. Republishing via `changeset publish` rewrites the workspace protocol to the real version range.

- Updated dependencies
  - @pseolint/core@0.2.2
  - @pseolint/mcp@0.2.2
