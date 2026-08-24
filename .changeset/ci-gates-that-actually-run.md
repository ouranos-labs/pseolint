---
"@pseolint/mcp": patch
---

Adds the missing `typecheck` script to `@pseolint/mcp`. `turbo run typecheck`
skips a workspace that has no such script, silently and successfully, so this
package had no static analysis reachable from `bun run typecheck`: a hard type
error in `src/bin.ts` produced `Tasks: 1 successful` and exit 0.

This lands alongside CI changes that make three existing gates actually run: the
calibration verdict ratchet (its input file is gitignored, so it skipped itself
on every CI run since it was written), the two renderer tests (they gate on a
Chromium binary CI never installed), and the em dash check (never wired at all).
