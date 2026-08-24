---
"@pseolint/core": patch
---

Three portability/correctness fixes surfaced by running the suite in a fresh Linux container:

- `normalizeAuditUrl` now normalizes Windows drive-letter (`D:\a\b\..\c`) and UNC paths correctly on any host OS by routing them through `path.win32.normalize`; posix `normalize()` treated their backslashes as filename characters and left `..` segments unresolved.
- Render mode can launch a pre-provisioned Chromium instead of requiring `playwright install`: new `RenderOptions.browserExecutablePath`, falling back to the `PSEOLINT_BROWSER_EXECUTABLE` env var. The renderer test also now skips (instead of failing) when the pinned Playwright browser build is absent on disk.
- AI probe cache: `ttlMs: 0` now means "always expired" even when the write and read land in the same millisecond (`ageMs >= ttlMs`; the strict `>` comparison made the expiry test flaky).
