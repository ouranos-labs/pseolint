---
"@pseolint/core": minor
---

feat(core): diff-mode audits + per-rule scope declarations

Adds a declarative `RULE_SCOPE` map at `rules/scope.ts` that marks every
rule ID as either `"page"` (output depends only on a single parsed page)
or `"corpus"` (needs the full set of pages — clustering, cross-page
comparisons, the link graph, robots.txt).

New `AuditOptions.mode`:
  - `"full"` (default) — runs all rules; identical to prior behaviour.
  - `"diff"`           — skips corpus-scoped rules so daily diff-audits
                         can re-evaluate only changed pages without
                         re-running clustering / link-graph / sitemap
                         rules against the unchanged corpus.

Consumed by the hosted monitoring pipeline (`apps/web`
`inngest/functions/monitor-domains.ts`). Local CLI and MCP flows are
unaffected — the default remains `"full"`.

Public API additions:
  - `RULE_SCOPE` — `Record<string, RuleScope>`, complete map of all 42
    current rule IDs.
  - `isRuleAllowedInDiff(ruleId)` — returns true for page-scoped rules;
    unknown IDs default to corpus (safer).
  - `RuleScope` type — `"page" | "corpus"`.

AEO rules are included in the scope map: `aeo/freshness-signals`,
`aeo/faq-coverage`, `aeo/answer-first`, `aeo/citable-facts`,
`aeo/non-replicable-value`, `aeo/content-modularity` are page-scoped;
`aeo/llms-txt` and `aeo/crawler-access` are corpus-scoped (they need
origin-level state).

Note: `answer-first` and `citable-facts` perform cross-page template
detection internally, but in diff mode they receive only the changed
pages — template-fact and template-opener detection are effectively
scoped to the diff set, not the historical corpus. This is acceptable
for daily re-runs; full audits remain the source of truth for
corpus-wide patterns.
