---
"@pseolint/core": patch
"@pseolint/mcp": patch
---

CI was running a quarter of the core test suite. `@pseolint/core`'s test script passed an unquoted `tests/**/*.test.ts` to vitest; without bash globstar `**` collapses to `*`, so only the 44 files exactly two levels deep matched and the other 118 (everything under `tests/rules/<category>/`, which is most of the rule coverage) never ran under `bun run test`, the command both `ci.yml` and `release.yml` invoke. Dropping the argument lets vitest's own include do the work, matching every other package in the repo: 162 files, 1525 tests.

Also hardens the MCP real-engine integration test. It pinned `PSEOLINT_MCP_JSON_CHAR_CAP` to a tuned 150000 so the airbyte_com fixture's JSON would stay under the cap, which made it a tripwire that fires whenever rules are added and the payload grows (a rule batch took the fixture to ~159k). The cap is now set far above any plausible payload, and the oversized-payload branch it bypasses, previously untested, gets its own case with a 1-char cap so neither side can drift.
