# Remediation: turning a failing audit into a passing one

pseolint reports **by template**, not by URL. So you fix in this order:

1. Run the audit: `npx pseolint <url>` (or the MCP audit tool).
2. Find the **worst template** — the one driving the site headline (worst verdict
   with ≥5% URL coverage). Fixing it moves the score most.
3. Read its `topDriver` — the rule firing across the most sampled pages. That's
   the one fix that repairs N pages at once.
4. Apply the recipe below for that rule. Re-run pseolint on staging. Repeat for
   the next-worst template.

Don't chase individual URL findings — a `uniformityScore` near 1.0 means the
whole template shares the defect; fix the template once.

## Fix recipes by rule family

**`spam/entity-swap` / `spam/near-duplicate` / `spam/template-diversity`**
The template swaps a variable into otherwise-identical copy. Add per-row
*conditional* content driven by real data: different sections fire for different
entities, not the same paragraph with the noun replaced. If you can't make a row
genuinely different, that row probably shouldn't be a page.

**`spam/thin-content` / `content/unique-value` / `content/value-add`**
Not enough page-specific substance. Add original analysis, real data tables, or
first-party insight per page. `content/unique-value` scores *rarity density*
(how unusual the page's content is vs the corpus), not word count — padding
won't move it.

**`spam/doorway-pattern` / `spam/template-coverage`**
You generated pages with no standalone value or beyond real demand. Either give
each page genuine utility, or `noindex` / don't generate the long tail with no
search volume. Fewer real pages beats more thin ones.

**`content/wikipedia-paraphrase` / `content/regurgitated-content`**
The page restates public knowledge. Add what only you have: proprietary data,
original examples, a point of view, sourced primary research.

**`content/translation-no-op` / `tech/hreflang-consistency`**
Machine-translated near-duplicates and/or broken hreflang. Use real localization
and emit correct reciprocal hreflang tags per the language set.

**`links/orphan-pages` / `links/link-depth` / `links/dead-ends`**
Pages aren't reachable, are too deep, or link nowhere. Wire the hub-and-spoke:
category hub → page, page → related pages, page → hub. Keep depth shallow and
ensure every page in the sitemap is linked.

**`tech/*` indexation (`robots-noindex-conflict`, `canonical-noindex-conflict`,
`sitemap-completeness`, `canonical-consistency`)**
Conflicting signals telling Google both to index and not to. Pick one per page:
canonical to self, no noindex, present in the right sitemap. Resolve the conflict
the rule names.

**`tech/csr-bailout`**
Substantive content only appears after client-side JS — invisible to the first
indexing pass. Server-render or pre-render the content that matters for ranking.

**`tech/soft-404`**
A nonexistent URL in the directory returns 200, so Google will index unbounded
junk. Return a real 404/410 for invalid slugs.

**`schema/*`**
Missing/invalid structured data. Emit valid JSON-LD with the required fields for
the page type, consistent across the template.

**`aeo/*`**
Pages aren't answer-engine ready. Lead with the answer (`answer-first`), include
citable facts, keep content modular, ship `llms.txt`, and don't block the
answer-engine crawlers (`crawler-access`).

## Keep it fixed

Once a template passes, gate it: add `@pseolint/action` to CI with a `risk`
threshold so a future template edit can't silently reintroduce the defect. Use
`--authority-score` if you want the verdict to reflect domain authority while
keeping the raw `risk` gate stable.
