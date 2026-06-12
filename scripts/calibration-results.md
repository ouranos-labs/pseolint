# Reputable-pSEO calibration report

- Run at: `2026-06-12T06:24:47.057Z`
- Ruleset version: `15`
- Corpus version: `1`
- Sites audited: 9
- Sites passed (verdict ≤ ceiling): 7
- Sites failed: 2
- Fetch errors: 3

## Per-site verdicts

| Site | Vertical | Expected ≤ | Actual | Δ | Top driver |
| ---- | -------- | ---------- | ------ | -- | ---------- |
| https://zapier.com/apps/slack/integrations | integration-directory | caution | ERROR | — | `—` |
| https://www.g2.com/categories | software-directory | caution | ready | -1 | `aeo/freshness-signals` |
| https://wise.com/us/currency-converter | currency-pair | concerning | concerning | 0 | `links/unreachable-from-root` |
| https://www.nerdwallet.com/best/credit-cards | finance-comparison | caution | ERROR | — | `—` |
| https://webflow.com/templates | template-gallery | caution | caution | 0 | `aeo/freshness-signals` |
| https://www.typeform.com/templates | template-gallery | caution | caution | 0 | `aeo/freshness-signals` |
| https://segment.com/integrations | integration-directory | caution | critical | **+2** | `spam/thin-content` |
| https://www.jasper.ai/templates | template-gallery | caution | ready | -1 | `content/missing-author` |
| https://ramp.com/spend-management | category-directory | caution | ready | -1 | `aeo/freshness-signals` |
| https://www.numbeo.com/cost-of-living | city-directory | caution | concerning | **+1** | `tech/canonical-consistency` |
| https://airbyte.com/connectors | integration-directory | caution | ready | -1 | `aeo/freshness-signals` |
| https://stripe.com/atlas/states | state-guides | ready | ERROR | — | `—` |

## Scorecard

Classes: 9 reputable, 0 policy-violating.

| | flagged | not flagged |
| ---- | ------: | ----------: |
| **policy-violating** | 0 (TP) | 0 (FN) |
| **reputable** | 3 (FP) | 6 (TN) |

Precision 0% · Recall 0% · F1 0%

Risk medians — reputable 38, policy-violating NaN; cleanly separated: no.

## Per-rule fire-rate (across audited sites)

| Rule | Sites fired | Firing ratio | Severities |
| ---- | -----------:| ------------:| ---------- |
| `aeo/citable-facts` | 9/9 | 100% | info=8, error=1 |
| `aeo/freshness-signals` | 8/9 | 89% | info=8 |
| `tech/og-completeness` | 4/9 | 44% | info=3, warning=1 |
| `content/title-uniqueness` | 3/9 | 33% | info=2, error=2, warning=1 |
| `aeo/answer-first` | 3/9 | 33% | info=2, error=1 |
| `content/citation-coverage` | 3/9 | 33% | warning=3 |
| `content/missing-author` | 3/9 | 33% | info=3 |
| `spam/thin-content` | 2/9 | 22% | info=1, error=1 |
| `content/eeat-signals` | 2/9 | 22% | info=2 |
| `spam/near-duplicate` | 1/9 | 11% | critical=1 |
| `links/unreachable-from-root` | 1/9 | 11% | warning=1 |
| `content/meta-uniqueness` | 1/9 | 11% | error=1 |
| `spam/boilerplate-ratio` | 1/9 | 11% | error=1 |
| `tech/hreflang-consistency` | 1/9 | 11% | info=1 |
| `content/heading-structure` | 1/9 | 11% | info=1 |
| `tech/canonical-consistency` | 1/9 | 11% | error=1, info=1 |
| `schema/json-ld-valid` | 1/9 | 11% | error=1 |

## Decision matrix

Per the spec at `docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md`:

- Firing ratio > 80% at error+ → suppress for programmatic-directory
- Firing ratio 50-80% at error+ → demote severity by one step + low confidence
- Firing ratio 30-50% at error+ → demote confidence to `low`
- Firing ratio < 30% → keep as-is
