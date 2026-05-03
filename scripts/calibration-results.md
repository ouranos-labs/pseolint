# Reputable-pSEO calibration report

- Run at: `2026-05-03T20:22:56.116Z`
- Ruleset version: `14`
- Corpus version: `1`
- Sites audited: 8
- Sites passed (verdict ≤ ceiling): 5
- Sites failed: 3
- Fetch errors: 4

## Per-site verdicts

| Site | Vertical | Expected ≤ | Actual | Δ | Top driver |
| ---- | -------- | ---------- | ------ | -- | ---------- |
| https://zapier.com/apps/slack/integrations | integration-directory | caution | concerning | **+1** | `aeo/citable-facts` |
| https://www.g2.com/categories | software-directory | caution | ready | -1 | `content/image-alt-text` |
| https://wise.com/us/currency-converter | currency-pair | caution | caution | 0 | `aeo/freshness-signals` |
| https://www.nerdwallet.com/best/credit-cards | finance-comparison | caution | ERROR | — | `—` |
| https://webflow.com/templates | template-gallery | caution | caution | 0 | `aeo/freshness-signals` |
| https://www.typeform.com/templates | template-gallery | caution | critical | **+2** | `aeo/freshness-signals` |
| https://segment.com/integrations | integration-directory | caution | critical | **+2** | `spam/boilerplate-ratio` |
| https://www.jasper.ai/templates | template-gallery | caution | caution | 0 | `aeo/citable-facts` |
| https://ramp.com/spend-management | category-directory | caution | ready | -1 | `tech/hreflang-consistency` |
| https://www.numbeo.com/cost-of-living | city-directory | caution | ERROR | — | `—` |
| https://airbyte.com/connectors | integration-directory | caution | ERROR | — | `—` |
| https://stripe.com/atlas/states | state-guides | ready | ERROR | — | `—` |

## Per-rule fire-rate (across audited sites)

| Rule | Sites fired | Firing ratio | Severities |
| ---- | -----------:| ------------:| ---------- |
| `aeo/freshness-signals` | 7/8 | 88% | info=7 |
| `aeo/citable-facts` | 6/8 | 75% | info=6 |
| `content/missing-author` | 4/8 | 50% | info=4 |
| `content/title-uniqueness` | 4/8 | 50% | info=4, error=2 |
| `aeo/answer-first` | 4/8 | 50% | info=4 |
| `content/eeat-signals` | 3/8 | 38% | info=3 |
| `tech/canonical-consistency` | 2/8 | 25% | error=1, info=2 |
| `tech/hreflang-consistency` | 2/8 | 25% | info=2 |
| `schema/json-ld-valid` | 1/8 | 13% | error=1 |
| `content/image-alt-text` | 1/8 | 13% | info=1 |
| `content/unique-value` | 1/8 | 13% | error=1 |
| `links/orphan-pages` | 1/8 | 13% | error=1 |
| `spam/boilerplate-ratio` | 1/8 | 13% | warning=1 |
| `tech/redirect-chain` | 1/8 | 13% | warning=1 |
| `spam/thin-content` | 1/8 | 13% | info=1 |
| `content/heading-structure` | 1/8 | 13% | info=1 |

## Decision matrix

Per the spec at `docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md`:

- Firing ratio > 80% at error+ → suppress for programmatic-directory
- Firing ratio 50-80% at error+ → demote severity by one step + low confidence
- Firing ratio 30-50% at error+ → demote confidence to `low`
- Firing ratio < 30% → keep as-is
