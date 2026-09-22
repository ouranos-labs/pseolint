---
"@pseolint/core": minor
"pseolint": minor
"@pseolint/mcp": patch
---

Scoring honesty: score catalog-shaped spam that already fires, without chasing verbose farms.

The same crawl can return a **stricter** verdict when `spam/near-duplicate`, `spam/entity-swap`, or `spam/doorway-pattern` fire as clusters. Reputable catalog ceilings were the calibration gate. Verbose AI farms that do not trip those rules still need `--content-effort`. Thin / AEO / chrome stay demoted on catalogs.

- **Cluster instance count.** Collapsed cluster/group findings score as `clusterSize` / `group.size` pages, not one row. `spam/doorway-pattern` impact is now `{ base: 30, perInstance: 5, max: 80 }`. `CORE_RULESET_VERSION` is 20.
- **Unclear profile.** Near-dup / entity-swap / doorway keep native severity and confidence. `programmatic-directory` keeps those two as warning but drops the extra `medium` confidence mute.
- **Template headline on unclear.** Worst-template-wins runs when the site is `unclear`; `small-marketing` stays on the legacy path.
- **Authority veto.** `>= 80` no longer softens the verdict when integrity is D/F or a veto rule cluster has `>= 10` instances at warning+.
- **`--strict`.** Bypasses pSEO-only suppression **and** scoring-profile severity/confidence demotions.
