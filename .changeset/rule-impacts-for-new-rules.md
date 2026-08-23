---
"@pseolint/core": patch
---

Score the 2026-08-19 rule batch on what its findings mean, instead of letting all 13 rules inherit the default impact and saturate its cap.

None of the 13 new rules had a `RULE_IMPACTS` entry, so each fell back to `DEFAULT_RULE_IMPACT` (base 5, per-instance 1, cap 25). Every one of them is page-scoped and fires once per audited page, so on a templated site the finding count is the SAMPLE SIZE, not the number of distinct defects: one missing `<meta name="viewport">` in one base layout produced 25 findings and the full 25-point cap. This is the hazard `tech/hreflang-consistency` has been pinned against since v0.4.3, whose note records that 350 findings from a single missing reciprocal pair "should not be treated as 350x the impact". The batch reintroduced it 13 times.

The measured effect on the reputable-pSEO calibration corpus was two hard verdict regressions (`g2.com/categories` ready to concerning, `typeform.com/templates` ready to caution) and AUC falling from 0.52 to 0.45. On g2 the discoverability bucket sat at 75 of 100, and 75 of that came from three new rules that had each saturated the cap from one repeated template defect.

Each rule now carries an explicit impact derived from what its findings mean, with the reasoning recorded inline. Where one template edit fixes every finding, `perInstance` is 0 and the cap equals the base, so the rule contributes what the single defect is worth: `content/image-attributes` 4, `links/generic-anchor-text` 3, `content/meta-description-presence` and `tech/hreflang-validity` 5, `tech/language-mismatch`, `tech/resource-weight`, `tech/snippet-suppression` and `tech/viewport-meta` 6, `links/crawlable-anchors` 8. Where the count really is a count of distinct problems, it still scales: `tech/sitemap-hygiene` (6/3/20) emits one rollup finding per issue kind, `tech/robots-txt-limits` (5/2/10) has at most two defects per site, `tech/html-size` (8/1/25) loses a different page's content each time it fires, and `tech/meta-robots-conflict` (12/1/20) deindexes the page outright.

Rules that fire at `error` are not double-charged for it: severity already reaches the verdict through the blocker-density floor, so the impact table does not also scale on their count.

Also in this change:

- **`per-template-scoring.ts` had a second, drifting copy of the table**, and per-template grades are computed from that one rather than from `auditor.ts`. It was missing all 13 new rules plus five that had drifted out earlier (`tech/core-web-vitals`, `content/common-phrase-reuse`, `content/wikipedia-paraphrase`, `content/citation-coverage`, `links/host-section-divergence`), so template cards and the site verdict disagreed. Both tables are now identical, and `rule-impact-parity.test.ts` fails the build if they diverge again.
- The same file had no equivalent of `RULE_CATEGORY_OVERRIDES`, so `links/host-section-divergence` scored into discoverability on template cards and integrity at site level. It now routes through a shared `categoryForRule`.
- Five scored rules have never had an impact entry at all (`links/unreachable-from-root`, `tech/csr-bailout`, `tech/robots-compliance`, `data/missing-binding`, `data/identical-across-pages`), and the table's `data/data-binding` entry matches no id the rule file emits. These predate this batch and moving them changes already-baselined scores, so they are recorded as an explicit backlog in the parity test rather than retuned here.

`packages/core/calibration/baseline-scorecard.json` is regenerated: it still recorded `rulesetVersion: 15` against an engine at 18. No reputable site's baseline verdict changed, and seven policy-violating sites moved stricter, so the new baseline records a corrected engine rather than a relaxed target. The committed per-rule recall floors are deliberately NOT lowered to match this run, so the outstanding `content/title-uniqueness` recall drop keeps reporting instead of being absorbed into the baseline.
