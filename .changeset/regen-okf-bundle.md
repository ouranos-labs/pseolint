---
"@pseolint/mcp": patch
"@pseolint/web": patch
---

Regenerate the OKF bundle so `/okf` and the MCP server's baked rule knowledge match the published catalog. `scripts/gen-okf.ts` derives from `MARKETING_RULES`, and that grew by 11 entries without the generator being re-run, so the statically-served bundle and `packages/mcp/src/okf-knowledge.ts` both sat at 31 rules while the catalog held 42. `llms.txt` points AI clients at `/okf/index.md` as one file per rule, so a stale bundle is an inventory claim the site cannot back.

Also stops one number from drifting again: the folklore research article hard-coded "59 rules" in an FAQ answer and now reads `SCORED_RULE_COUNT` from the engine, the way `/methodology`, `llms.txt` and the landing-page rule ring already do.
