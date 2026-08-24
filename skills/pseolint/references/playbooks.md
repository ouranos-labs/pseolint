# The 12 playbooks, with their pseolint gates

For each playbook: the pattern, the data you need, the URL shape, the one thing
that makes it *not* thin, and **the named pseolint rules that decide whether you
pulled it off.** Rules are referenced by name only: run `pseolint --explain
<rule>` or read the MCP rule resource for the current threshold. Numbers live in
the engine, not here, so they can't drift out of sync.

Cross-cutting rules apply to **every** playbook, so they're listed once at the
bottom instead of repeated twelve times.

---

### 1. Templates: "[type] template"
- **Data:** your own product/design assets. **URL:** `/templates/[type]/`
- **Not thin when:** the templates are actually usable (not previews) and each
  page carries multiple real variations + guidance, not a single hero image.
- **Gates:** `spam/thin-content`, `content/value-add`, `content/unique-value`,
  `spam/near-duplicate` (don't ship the same boilerplate around each download).

### 2. Curation: "best [category]"
- **Data:** real testing / first-hand expertise. **URL:** `/best/[category]/`
- **Not thin when:** visible evaluation criteria, dates, and a point of view:
  not an affiliate list ranked by payout.
- **Gates:** `content/eeat-signals`, `aeo/freshness-signals`,
  `content/citation-coverage`, `content/value-add`, `content/missing-author`.

### 3. Conversions: "[X] to [Y]"
- **Data:** accurate real-time data + a working tool. **URL:** `/convert/[from]-to-[to]/`
- **Not thin when:** the tool functions, the data is live, and the surrounding
  copy isn't identical across every pair.
- **Gates:** `data/data-binding`, `spam/near-duplicate`, `spam/entity-swap`,
  `content/unique-value`.

### 4. Comparisons: "[X] vs [Y]"
- **Data:** honest product research. **URL:** `/compare/[x]-vs-[y]/`
- **Not thin when:** balanced, feature-level analysis with use-case
  recommendations: not a table with two names swapped in.
- **Gates:** `spam/entity-swap`, `content/value-add`, `content/title-uniqueness`,
  `content/meta-uniqueness`, `spam/near-duplicate`.

### 5. Examples: "[type] examples"
- **Data:** real, high-quality samples. **URL:** `/examples/[type]/`
- **Not thin when:** examples are categorized and each carries explanatory
  analysis, not just an embedded gallery.
- **Gates:** `spam/thin-content`, `content/value-add`, `content/image-alt-text`,
  `content/unique-value`.

### 6. Locations: "[service] in [city]"
- **Data:** actual local databases. **URL:** `/[service]/[city]/`
- **Not thin when:** real location-specific data and insight per page. This is
  the classic doorway-cluster trap: the city name in the copy is not "local
  data."
- **Gates:** `spam/doorway-pattern`, `spam/entity-swap`, `spam/template-diversity`,
  `content/unique-value`, `data/data-binding`, `links/cluster-key`.

### 7. Personas: "[product] for [audience]"
- **Data:** genuine audience research. **URL:** `/for/[persona]/`
- **Not thin when:** persona-specific pain points, examples, and testimonials:
  not the home page with the audience noun swapped.
- **Gates:** `spam/entity-swap`, `content/unique-value`, `content/value-add`.

### 8. Integrations: "[product A] [product B] integration"
- **Data:** real API/integration docs. **URL:** `/integrations/[product]/`
- **Not thin when:** actual setup steps and working functionality, not a stub
  promising an integration that doesn't ship.
- **Gates:** `spam/thin-content`, `data/data-binding`, `content/value-add`,
  `schema/required-fields`.

### 9. Glossary: "what is [term]"
- **Data:** domain expertise. **URL:** `/glossary/[term]/`
- **Not thin when:** definitions exceed dictionary depth with examples and
  original framing: the Wikipedia-rehash detector is unforgiving here.
- **Gates:** `content/wikipedia-paraphrase`, `content/regurgitated-content`,
  `content/value-add`, `aeo/answer-first`, `aeo/citable-facts`.

### 10. Translations: same content, multiple languages
- **Data:** native speakers (not machine translation). **URL:** `/[lang]/[page]/`
- **Not thin when:** real localization + correct hreflang. Machine-translated
  duplicates trip the no-op detector.
- **Gates:** `content/translation-no-op`, `tech/hreflang-consistency`,
  `schema/consistency`.

### 11. Directory: "[category] tools"
- **Data:** aggregated, maintained listings. **URL:** `/directory/[category]/`
- **Not thin when:** comprehensive coverage, filtering, and regular updates:
  not a stale scrape.
- **Gates:** `spam/template-coverage`, `aeo/freshness-signals`, `links/dead-ends`,
  `links/cluster-key`, `content/value-add`.

### 12. Profiles: "[entity name]"
- **Data:** sourced research. **URL:** `/people/[name]/` (or `/companies/…`)
- **Not thin when:** unique, sourced insight beyond aggregating what's already
  public.
- **Gates:** `content/regurgitated-content`, `content/citation-coverage`,
  `content/eeat-signals`, `aeo/citable-facts`.

---

## Cross-cutting gates (apply to every playbook)

- **Uniqueness:** `content/title-uniqueness`, `content/meta-uniqueness`,
  `spam/boilerplate-ratio`, `spam/template-diversity`.
- **Schema:** `schema/json-ld-valid`, `schema/required-fields`, `schema/consistency`.
- **Internal links:** `links/orphan-pages`, `links/link-depth`, `links/dead-ends`,
  `links/cluster-key`, `links/host-section-divergence`.
- **Indexation:** `tech/robots-noindex-conflict`, `tech/canonical-noindex-conflict`,
  `tech/canonical-consistency`, `tech/sitemap-completeness`,
  `tech/robots-sitemap-presence`, `tech/redirect-chain`.
- **Render:** `tech/csr-bailout` (content visible without client JS),
  `tech/soft-404` (nonexistent URLs must 404, not 200), `tech/og-completeness`.
- **AEO:** `aeo/answer-first`, `aeo/citable-facts`, `aeo/faq-coverage`,
  `aeo/content-modularity`, `aeo/freshness-signals`, `aeo/summary-bait`,
  `aeo/llms-txt`, `aeo/crawler-access`.
- **Content quality:** `content/heading-structure`, `content/common-phrase-reuse`,
  `content/eeat-signals`, `content/missing-author`.

When the design is ready, prove it: `npx pseolint <staging-url>`; it samples K
pages per template and returns a per-template verdict, so one fix covers N pages.
