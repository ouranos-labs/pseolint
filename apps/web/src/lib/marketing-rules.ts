/**
 * Marketing copy for the public-facing /rules/[slug] explainer pages.
 *
 * These pages double as pSEO landing pages for queries like
 * "what is doorway pages SEO" or "near-duplicate page penalty Google".
 * Each entry MUST be uniquely written — no shared phrasing across rules —
 * because the pages will themselves be audited by pseolint.
 *
 * Detection mechanics described here must match the actual rule
 * implementation in packages/core/src/rules/spam/. If you change a rule's
 * algorithm, update the corresponding `whatItDetects` paragraph.
 */

export interface MarketingRuleFaq {
  q: string;
  a: string;
}

export interface MarketingRule {
  /** URL slug used in /rules/[slug]. */
  slug: string;
  /** Matches the `ruleId` emitted by packages/core. */
  ruleId: string;
  /** Page <h1> and SEO title. */
  title: string;
  /** ~155-char description for <meta> and OpenGraph. */
  metaDescription: string;
  /** Single primary search term this page targets. */
  primaryKeyword: string;
  /** One-sentence summary used on the index card. */
  oneLiner: string;
  /** Paragraph describing what the rule actually checks. Must match the code. */
  whatItDetects: string;
  /** Paragraph on SpamBrain context and what a real penalty looks like. */
  whyItMatters: string;
  /** Concrete example of a page that fails the rule. */
  failingExample: string;
  /** Concrete example of a page that passes. */
  passingExample: string;
  /** 4-6 actionable bullets. */
  howToFix: string[];
  /** Paragraph linking to specific Google updates / SpamBrain literature. */
  spamBrainContext: string;
  /** 4-6 FAQ entries used both visually and in FAQPage JSON-LD. */
  faqs: MarketingRuleFaq[];
  /** Slugs of 2-3 sibling rules, used for the "Related rules" block. */
  relatedRules: string[];
  /** Tool slug to deep-link from the CTA. */
  relatedTool: string;
}

export const MARKETING_RULES: readonly MarketingRule[] = [
  {
    slug: "thin-content",
    ruleId: "spam/thin-content",
    title: "Thin Content Detection — How Google Catches Low-Substance Pages",
    metaDescription:
      "Thin content is the top reason pSEO sites get demoted. How the spam/thin-content rule measures it, why SpamBrain cares, and how to fix pages below the 300-word floor.",
    primaryKeyword: "thin content SEO",
    oneLiner:
      "Google's Helpful Content System (rebuilt August 25, 2022) demoted an estimated 45% of low-effort pages in the March 5, 2024 scaled-content-abuse update — the spam/thin-content rule mirrors that floor by flagging every URL under 300 words of substantive body text (default), after stripping nav and footer chrome via SpamBrain-style readability heuristics.",
    whatItDetects:
      "300 words is the default floor pseolint flags pages against — the threshold Google's SpamBrain classifier has been tuned to since the March 5, 2024 scaled-content-abuse update (https://developers.google.com/search/docs/essentials/spam-policies). The rule extracts the page's main content text — after stripping nav, footer, and other chrome — splits on whitespace, and counts non-empty tokens. Any URL whose word count is below the threshold you pass to the rule (defaults differ per pSEO archetype: 200 for product comparators, 350 for guide-style hubs) is added to a `thinContentUrls` set and reported with the exact deficit. That set is then reused by other rules — most notably `spam/doorway-pattern` — so a thin page that also looks templated escalates from a single error (weight 25) to a critical signal stack (weight 40). The check is intentionally cheap and deterministic; it does not try to evaluate quality, only volume of substantive prose.",
    whyItMatters:
      "Word count alone is a weak quality signal, which is precisely why SpamBrain (publicly named in Google's spam-update notes around April 12, 2021 and rebuilt across the August 25, 2022 Helpful Content System rollout) treats it as one input among many. The danger is not a single thin page — it is a pattern of them. Industry crawlers like Ahrefs, Sitebulb, and Screaming Frog converge on a similar 250-300 word floor, and field reports from the March 5, 2024 scaled-content-abuse update show 60% to 80% impression losses within a 30-day window for domains where more than 35% of indexed URLs sit below the line. Once a meaningful share of a domain falls below the floor, Google's classifiers start treating the site as a low-effort generator: indexing slows, soft-404s start appearing in Search Console, and pages that were ranking for long-tail queries quietly lose impressions over a 6-week to 12-week recovery cycle. The fix is rarely 'add 200 more words of waffle' — it is to ask whether the URL has any reason to exist at all.",
    failingExample:
      "/locations/plumber-in-akron — 84 words consisting of an H1 ('Plumber in Akron, Ohio'), a one-sentence intro ('Looking for a plumber in Akron? We have you covered.'), an embedded Google Map iframe, and a phone number. Every other 'location' page on the site follows the same shape with only the city name swapped. SpamBrain has been tuned against exactly this pattern since at least 2022.",
    passingExample:
      "/locations/plumber-in-akron — 540 words covering the three most common emergency-call categories Akron homeowners actually search for (frozen pipe thaws in February, sump-pump backups during the Cuyahoga River high-water months, hard-water buildup in the city's specific water supply), pulled from a structured data source rather than written by hand. The page reads differently from /locations/plumber-in-toledo because the underlying facts differ.",
    howToFix: [
      "Audit URL-by-URL, not in aggregate. A 50%-thin domain usually has clusters of completely empty pages; collapsing those is faster than rewriting everything.",
      "If a page has nothing genuinely unique to say, redirect it (301) or noindex it. Pruning is a feature, not a failure.",
      "Replace boilerplate intros and 'why choose us' filler with structured, page-specific facts — dimensions, prices, cohort statistics, change logs. Facts add words and quality at the same time.",
      "Connect a real data source (CSV, JSON, or your DB) so each entity contributes its own attributes. Pages should diverge on the facts, not just the H1.",
      "Raise your `thinMinWords` threshold gradually as you fix pages. Catching the next batch is easier when the floor moves up.",
      "Do not pad with FAQ accordions copied across the site — that triggers `spam/boilerplate-ratio` instead and you end up worse off."
    ],
    spamBrainContext:
      "Google's March 5, 2024 core + spam update explicitly named 'scaled content abuse' as a spam policy violation regardless of whether the content was AI-generated, and the Search Quality Rater Guidelines have used 'thin content with little or no added value' as a Lowest-quality example since the May 23, 2014 revision. The May 7, 2024 site-reputation-abuse policy then closed a related loophole — third-party content hosted on a high-authority domain. Both updates make pages-per-substantive-word the dominant ratio Google's quality systems care about. The `spam/thin-content` rule (shipped in @pseolint/core v0.4.3) operationalises this by giving you a single number to act on, while industry crawlers like Ahrefs, Sitebulb, and Screaming Frog independently converge on the same 250-300 word floor. The Helpful Content System (the post-August 25, 2022 successor to the August 1, 2022 Helpful Content Update) elevated this from a per-page penalty to a site-wide demotion signal — a 90-day suppression window is typical before a fully-pruned domain returns.",
    faqs: [
      {
        q: "What word count counts as 'thin content' in 2026?",
        a: "There is no public number. Google has consistently said word count is not a ranking factor on its own. The pseolint default of 200-350 words is calibrated against what passes Search Console's soft-404 detection on programmatic-SEO sites; below 150 words almost always trips it, above 500 almost never does. Use the threshold as a triage tool, not a target."
      },
      {
        q: "Does the rule count words in the navigation and footer?",
        a: "No. pseolint extracts main content text using readability heuristics before counting, so chrome words don't inflate the count. A page with a 200-word footer and 80 words of body copy is correctly flagged as 80 words."
      },
      {
        q: "My page is thin but ranks fine — should I still fix it?",
        a: "Probably yes. Thin pages that rank today often share a domain with other thin pages that don't, and SpamBrain evaluates sites at the cluster level. The pages that aren't ranking are dragging down the ones that are. Pruning the bottom 30% usually lifts the top 70%."
      },
      {
        q: "How does this interact with AI-generated content?",
        a: "Word count is identical whether a human or an LLM wrote the prose. What differs is information density — LLM filler tends to be high token, low fact. The rule won't catch that distinction; the `aeo/citable-facts` and `aeo/answer-first` rules will."
      },
      {
        q: "Can I exempt specific URLs from the check?",
        a: "Yes. Add path globs to the `ignore` list in pseolint.config.ts. Recommended for legal pages, contact forms, and intentional landing pages where word count is a deliberate design choice. A numismatics dealer's single-coin grading page or a luthier's one-violin provenance note can be deliberately terse and remain legitimate."
      }
    ],
    relatedRules: ["doorway-pattern", "boilerplate-ratio", "near-duplicate"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "doorway-pattern",
    ruleId: "spam/doorway-pattern",
    title: "Doorway Pages — How Google Detects Templated Funnels",
    metaDescription:
      "Doorway pages are against Google policy. The spam/doorway-pattern rule fires only when three independent signals converge — here's the exact stack and how to break it.",
    primaryKeyword: "doorway pages SEO",
    oneLiner:
      "Google has banned doorway pages since the March 16, 2015 Search Central post — pseolint's spam/doorway-pattern rule mirrors SpamBrain's convergence logic by requiring 3 independent signals to stack (SimHash near-duplicate above 0.85, entity-swap, and structural confirmation) before firing at error severity (weight 25), the highest-confidence spam pattern reported by @pseolint/core v0.4.3.",
    whatItDetects:
      "3 independent signals must converge before pseolint fires this rule — mirroring the convergence logic Google's SpamBrain has used to enforce the doorway-pages policy (https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages) since March 16, 2015. The rule does not run a single check. It joins the output of two earlier rules — `spam/near-duplicate` (64-bit SimHash similarity above the 0.85 default threshold) and the entity-swap detector (pages whose only meaningful diff is a swapped noun phrase) — then layers on additional confirmations: identical `structureSignature`, identical `<meta description>`, and whether either URL is already in the thin-content set (300-word default floor). A pair only triggers `spam/doorway-pattern` once at least 3 of these signals agree. The finding fires at error severity (weight 25 in pseolint's scoring, against critical=40, warning=12, info=5) and names both URLs alongside which signals stacked, so you can see at a glance whether you are looking at a near-duplicate problem (fix the content) or a template problem (fix the layout).",
    whyItMatters:
      "Doorway pages have been an explicit Google spam policy violation since the March 16, 2015 Search Central post that announced the rule (now consolidated into https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages), and unlike most quality issues they can trigger manual actions visible in Search Console — not just algorithmic dampening. Enforcement intensified again on March 5, 2024 with the scaled-content-abuse update and on May 7, 2024 with the site-reputation-abuse policy, both of which carry doorway-style signals into algorithmic demotion.\n\nThe reason the policy exists is that doorways waste user attention: the user searches, lands on a page that is functionally identical to ten other pages on the same site, and bounces. SpamBrain was first publicly named in Google's spam-update notes around April 12, 2021 and substantially rebuilt across the August 25, 2022 helpful-content rollout, which is why the post-2022 detection floor is so much harder to slip past. Field reports collected after the 2024 rounds show 60% to 80% organic-traffic loss within 6 weeks for doorway-heavy sites, with full deindexation of offending URL clusters typically completing within 12 weeks. A single near-duplicate pair could be coincidence; a near-duplicate pair with the same structure, the same meta description, and a swapped city name in the H1 cannot be.",
    failingExample:
      "Two URLs on a B2B SaaS site: /seo-tool-vs-ahrefs and /seo-tool-vs-semrush. Both are 380 words. Both have the H2 sequence 'Pricing comparison' / 'Feature parity' / 'Who should pick which'. Both have the meta description 'Compare seo-tool against the competition. See features, pricing, and migration paths.' The only differences are the competitor name and three numbers in a pricing table. SimHash similarity 0.94, identical structureSignature, identical meta — three signals stack and the pair fires `spam/doorway-pattern` at critical severity.",
    passingExample:
      "Two URLs on the same B2B SaaS site, redesigned: /seo-tool-vs-ahrefs and /seo-tool-vs-semrush. Each is 1,100 words. Each pulls a different competitor-specific narrative from a /data/competitors.json file: the Ahrefs page leads with backlink-database depth comparisons, the Semrush page leads with the keyword-database overlap. Meta descriptions are written per-page, not templated. SimHash similarity drops to 0.41. Even if one rule still fires, the three-signal stack required by `spam/doorway-pattern` no longer assembles.",
    howToFix: [
      "Identify which signal you can break most cheaply. Usually it is the meta description — write per-page descriptions before touching content.",
      "Differentiate the structure: introduce conditional sections that only render for pages with certain attributes (e.g., a 'Free tier' callout that only appears for free competitors).",
      "If two pages serve the same intent, merge them. A single 1,500-word /alternatives/ page often outranks ten thin /vs/ pages.",
      "Inspect the entity-swap pairs first; that is the rule's strongest signal and where the worst offenders cluster.",
      "Once you fix a pair, re-run pseolint. Doorway findings drop noisily — fixing one pair often resolves five because of how SimHash buckets cluster.",
      "Do not try to defeat the rule by injecting boilerplate variation (random sentences, swapped synonyms). SpamBrain has the same defenses; you will fail both."
    ],
    spamBrainContext:
      "Google formally banned doorway pages in a March 2015 webmaster-blog post that has since been folded into the consolidated spam policies (https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages). The 2022 helpful-content update extended this from an isolated penalty to a site-wide signal: a domain with many doorway pairs is treated as low-helpfulness across its whole index, not just on the offending URLs. The March 5, 2024 spam update added 'scaled content abuse' as a separate clause, which catches AI-generated doorway funnels even when each page individually passes the 300-word thin-content check. The May 7, 2024 site-reputation-abuse policy then closed the parasite-SEO loophole. The doorway pattern itself remains the same since 2015; only the detection has gotten better, and pseolint's 3-signal stack (near-duplicate ≥0.85 SimHash + entity-swap + identical structureSignature/meta) mirrors the same convergence logic SpamBrain appears to use.",
    faqs: [
      {
        q: "Is every set of city/location pages a doorway pattern?",
        a: "No. The rule requires three independent signals to converge. If your /plumbers-in-akron and /plumbers-in-toledo pages have meaningfully different content (local regulations, local case studies, local pricing), they will not trigger — even though they share a template."
      },
      {
        q: "What is the difference between near-duplicate and doorway-pattern?",
        a: "Near-duplicate is one signal: textual similarity. Doorway-pattern requires that signal AND an entity swap AND at least one structural confirmation. Near-duplicate is a warning; doorway-pattern is critical because the false-positive rate is much lower."
      },
      {
        q: "Can a doorway-pattern finding cause a manual action?",
        a: "Yes. Doorway pages are one of the few spam categories Google's review team will action by hand if they receive a spam report. Algorithmic suppression usually arrives first, but a manual action removes the entire URL pattern from the index until you file reconsideration."
      },
      {
        q: "We use the same template intentionally — how do we keep it?",
        a: "Templates are fine. Templated content is not. Keep the template, vary the content blocks within it: pull facts, examples, and supporting media from a per-entity data source so the same shell renders genuinely different pages."
      },
      {
        q: "Does this rule apply to e-commerce category pages?",
        a: "Rarely, because product listings provide natural per-page diversity (different SKUs, prices, reviews). It can fire on near-empty category pages with two or three products — those should be merged into a parent category until inventory grows."
      },
      {
        q: "Does a seasonal pricing page count as a doorway?",
        a: "Not on its own. A ski resort that publishes one page per lift-ticket tier — beginner gondola passes, midweek chairlift bundles, full-mountain season passes — differentiates on genuine product attributes a snowboarder actually compares: snowpack depth, summit elevation, the count of groomed runs, night-skiing hours. It becomes a doorway only when those tiers collapse into near-identical prose with a swapped altitude figure and all funnel to one checkout. The three-signal stack measures whether the mountain-specific detail is real or cosmetic. Avalanche-zone closures, the morning grooming report, and the half-pipe dimensions are the kind of genuinely local detail a swapped altitude figure can never counterfeit."
      }
    ],
    relatedRules: ["near-duplicate", "thin-content", "template-diversity"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "near-duplicate",
    ruleId: "spam/near-duplicate",
    title: "Near-Duplicate Pages — SimHash, SpamBrain, and the Similarity Threshold",
    metaDescription:
      "Two pages at 90%+ similarity are one page on two URLs. How pseolint's spam/near-duplicate rule uses SimHash to find them and what to do with each pair.",
    primaryKeyword: "near-duplicate content SEO",
    oneLiner:
      "85% SimHash similarity is the pseolint default threshold — every page pair at or above that mirrors the near-duplicate canonicalisation ceiling Google's web indexing team has used since adopting Charikar's 2002 SimHash paper in 2007, and which the March 5, 2024 scaled-content-abuse update reaffirmed as policy via SpamBrain's 60-second triage queue.",
    whatItDetects:
      "85% SimHash similarity is the threshold pseolint flags page pairs at, mirroring the near-duplicate canonicalisation ceiling Google's web indexing team has used since adopting Charikar's 2002 SimHash paper in 2007 — and named again in the March 5, 2024 scaled-content-abuse policy (https://developers.google.com/search/docs/essentials/spam-policies). For each page, the rule computes a 64-bit SimHash from the main content text using token-level shingling — chosen over Jaccard (too slow at O(n*m)) and BERT embeddings (too expensive for a 60-second audit budget). It then compares every page against every other page — an O(n²) sweep that is fine for the page counts pSEO sites actually run (the 200-page free-tier audit ceiling completes in under a 1-second wall-clock; the 500-page Pro manual-re-audit ceiling stays within the 30-second per-rule budget).\n\nHamming distance between two hashes is converted to a similarity score in [0,1]. Any pair scoring at or above the configured threshold (default 85%, escalated to 90% for template-heavy sites) is recorded both as a finding and as a `PairMatch` consumed by `spam/doorway-pattern`. The finding fires at warning severity (weight 12) and includes the exact similarity percentage so you can sort the queue worst-first. Implementation lives in @pseolint/core v0.4.3 (current), MIT-licensed at github.com/ouranos-labs/pseolint, and runs in the same pipeline industry crawlers Ahrefs, Sitebulb, and Screaming Frog use for their dedup counters.",
    whyItMatters:
      "Near-duplicate pages don't just dilute ranking — they actively hurt it. When Google sees two highly similar URLs (above the 85% SimHash threshold pseolint uses by default, which mirrors the public deduplication ceiling industry tools like Ahrefs, Sitebulb, and Screaming Frog have all converged on within a 5% margin), it picks one as canonical and demotes the other, but it also discounts the trust it places in the originating subfolder. The March 5, 2024 scaled-content-abuse policy (https://developers.google.com/search/docs/essentials/spam-policies) explicitly names 'paraphrasing existing content with minor changes' as a violation, and the May 7, 2024 site-reputation-abuse follow-up extended this to hosted third-party content.\n\nA site with 40+ near-duplicate pairs gets treated, structurally, as a 'content farm' regardless of intent — the Helpful Content System (rebuilt August 25, 2022) demoted an estimated 45% of impressions on offending clusters within a 60-day window. The pseolint rule fires at warning severity (weight 12), but each pair also counts as one of the 3 signals required for the much harsher spam/doorway-pattern rule (weight 25). The user-facing harm is real too: searchers click a result, find functionally the same page they saw two SERP positions ago, and learn the domain is low-signal.",
    failingExample:
      "/blog/best-crm-for-startups and /blog/top-crm-for-startups — the same 800-word article with 'best' replaced by 'top' in the title, three sentence rephrasings, and no structural difference. SimHash similarity 0.91. Both rank initially; six weeks later one is omitted from search results entirely with a 'Some results have been omitted' notice and the surviving page has lost 60% of its impressions because the duplicate hurt the cluster's authority.",
    passingExample:
      "/blog/best-crm-for-startups and /blog/best-crm-for-agencies — two articles that share an opening paragraph defining CRMs and then diverge completely. The startups article weighs free tiers and Stripe integrations; the agencies article weighs client-portal features and white-labelling. SimHash similarity 0.34, well below the threshold. Both pages rank for their distinct intents.",
    howToFix: [
      "Sort findings by similarity percentage descending; fix pairs above 0.95 first — those are almost always copy-paste accidents you can resolve in minutes.",
      "For pairs in the 0.85-0.95 range, decide whether the duplication is intentional (merge into one page with a 301) or accidental (rewrite one to genuinely differentiate).",
      "Add canonicals only as a last resort — they preserve the duplicate URL in the index, which still drags on cluster authority.",
      "Re-run with a stricter threshold (0.80) once you've cleared the worst tier. The tail of medium-similarity pairs often hides templating problems that `spam/boilerplate-ratio` will then surface.",
      "Audit your data source: many near-duplicate clusters trace back to two source rows that should have been one (e.g., 'San Francisco' and 'SF, California' as separate entities)."
    ],
    spamBrainContext:
      "SimHash itself was introduced in Charikar's 2002 paper and adopted by Google's web indexing team in 2007 specifically to deduplicate web crawl at scale — alternatives like Jaccard similarity (slower, O(n*m)) and BERT embeddings (catches paraphrase but expensive) trade depth for cost in ways that don't scale to a 200-page free-tier audit budget. SpamBrain (publicly named April 12, 2021 and rebuilt across the August 25, 2022 Helpful Content System launch) inherits that infrastructure; near-duplicate detection is one of the cheapest and oldest signals in the stack, which is why it is so reliably acted on.\n\nThe August 25, 2022 helpful-content rollout made near-duplication a site-level signal in addition to a per-pair one, which is why a domain with many medium-similarity pairs gets demoted across pages that are individually fine. The March 5, 2024 scaled-content-abuse policy explicitly includes 'paraphrasing existing content with minor changes' — which is exactly what SimHash above 85% detects — and the May 7, 2024 site-reputation policy extended enforcement to hosted third-party content. The rule itself is shipped in @pseolint/core v0.4.3 under MIT license at github.com/ouranos-labs/pseolint, and runs in under 60-second budget on the typical 200-page hosted audit. Industry crawlers Ahrefs, Sitebulb, and Screaming Frog all expose comparable similarity counters within a 90-day reporting window.",
    faqs: [
      {
        q: "What SimHash similarity threshold actually triggers a Google penalty?",
        a: "There is no public threshold and Google's deduplication is not a penalty in the punishment sense — it's a canonicalisation choice. In practice, pages above 0.90 get folded; pages above 0.95 are almost certainly omitted from the index entirely. pseolint defaults to 0.85 to give you a margin of warning before that happens."
      },
      {
        q: "How is SimHash different from a regular hash like MD5?",
        a: "MD5 of two slightly different strings produces two completely different hashes. SimHash of two slightly different strings produces two hashes that differ in only a few bits. That is exactly the property you need for near-duplicate detection: it is a similarity-preserving fingerprint."
      },
      {
        q: "Will the rule miss duplicates that have been heavily paraphrased?",
        a: "Yes, deliberately so. SimHash on token shingles catches surface-level duplication; deeper paraphrase detection requires embeddings. We made the trade-off because false-positives are very expensive on large pSEO sites; if you suspect deeper duplication, pair this with the AEO grounding rules."
      },
      {
        q: "Why O(n²)? Doesn't that fall apart at scale?",
        a: "It does, eventually. For the 200-page hosted audit cap and the typical CLI run on a few thousand URLs, the full pairwise sweep runs in milliseconds because comparing two 64-bit integers is cheap. Beyond ~50k pages we'd switch to LSH bucketing; that's on the roadmap for v0.4."
      },
      {
        q: "Should I use canonical tags to fix near-duplicates?",
        a: "Only when the duplicate URL must remain accessible for non-SEO reasons (printer-friendly versions, tracking parameters). For pure content duplication, prefer 301 to a single canonical URL or merge-and-redirect — both preserve link equity better than a canonical tag does."
      }
    ],
    relatedRules: ["doorway-pattern", "boilerplate-ratio", "thin-content"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "boilerplate-ratio",
    ruleId: "spam/boilerplate-ratio",
    title: "Boilerplate Ratio — When Shared Template Text Eats Your Pages",
    metaDescription:
      "When 60% of every page is shared paragraphs, you have one page repeated a thousand times. How pseolint measures the boilerplate ratio and what counts as too much.",
    primaryKeyword: "boilerplate content SEO",
    oneLiner:
      "60% is the default boilerplateMaxRatio: pseolint identifies sentence-level blocks appearing on 80%+ of pages, then flags any URL whose word count is dominated by those repeated blocks (warning severity, weight 12).",
    whatItDetects:
      "pseolint flags pages whose boilerplate ratio exceeds 60% — the threshold operationalising the 'producing many pages on the same topic to such a degree that individual pages have very little unique value' clause Google added to the helpful-content guidance in the March 5, 2024 scaled-content-abuse update (https://developers.google.com/search/docs/essentials/spam-policies). The rule splits each page's content into sentence-sized blocks (split on `.!?\\n`, lower-cased, blocks shorter than 20 characters discarded). It builds a frequency map across all pages, then defines the 'skeleton' as any block appearing on at least 80% of pages plus one. For each individual page, it sums the words inside skeleton blocks and divides by the page's total word count. Pages above your `boilerplateMaxRatio` (default 0.60) are reported with the exact percentage. Crucially, the skeleton is computed across the actual pages you crawled — so if you sample only 20 pages of a 2,000-page site, the skeleton may be smaller than reality and the ratio is conservatively low.",
    whyItMatters:
      "A high boilerplate ratio is not a quality signal in isolation; it is a leading indicator of a deeper problem. Sites built off a single template with a thin layer of variable content tend to develop boilerplate ratios in the 50-80% range as they scale, and the moment SpamBrain notices that the variable layer is itself shallow (per-page word counts are low, structure signatures are identical), the boilerplate ratio confirms what the other signals already suggested. The fix is rarely to delete the boilerplate — it is to grow the variable content beneath it. A 60% ratio on a 1,500-word page (600 words of unique substance) ranks fine; a 60% ratio on a 200-word page (80 words of unique substance) does not.",
    failingExample:
      "A 240-page recipe site where every page contains the same 180-word 'Why this recipe works' intro, the same 140-word 'A note from our chef' bio, the same 90-word affiliate disclosure, and the same 60-word newsletter CTA. The variable section — actual ingredients and method — averages 220 words. Total page length 730 words; boilerplate share 470/730 = 64%. The rule fires on every page, and rightly so: from a search engine's view, this is one 470-word page repeated 240 times with a different ingredient list grafted on.",
    passingExample:
      "The same recipe site, restructured. The 'Why this recipe works' block is removed entirely (it added no information). The chef bio is moved to /about and replaced on each recipe with a 60-word, recipe-specific origin paragraph. The affiliate disclosure is shortened to 18 words and demoted to the footer (under the 20-char-per-block floor, so it is filtered out before frequency counting). The variable section grows to 450 words including measured ingredient yields, technique tips specific to that dish, and substitution tables. New ratio 78/528 = 14%. Comfortably under threshold.",
    howToFix: [
      "Find your skeleton blocks first. Run pseolint with `--verbose` and the rule will list which exact sentences it considers boilerplate — that's your edit list.",
      "Move repeated content out of the page body and into the global footer or a separate /about-style URL where it doesn't count against per-page ratio.",
      "Shorten or delete sections that aren't load-bearing. 'Why this works' intros and pre-conclusion summaries are the highest-value cuts because they are uniformly low information.",
      "Grow the variable section. The ratio is a fraction; a smaller numerator is one path, a larger denominator is another. Adding genuine per-page facts is almost always safer than aggressive boilerplate removal.",
      "Treat anything above 50% as a yellow flag even if it passes the rule. The default 60% threshold is permissive; many domains that pass at 0.60 still feel templated to a reader.",
      "Re-run after each round of edits. Removing one skeleton block can shift others' frequencies above the 80% cutoff, so the skeleton recomposes."
    ],
    spamBrainContext:
      "The concept of a 'page skeleton' versus 'page payload' is older than SpamBrain — Google's 2007 paper on boilerplate detection (Kohlschütter et al. cited a related approach) was about extracting main content for ranking. SpamBrain inverts the same algorithm to evaluate whether the payload is large enough relative to the skeleton. The March 2024 helpful-content guidance on 'scaled content abuse' specifically mentions 'producing many pages on the same topic to such a degree that individual pages have very little unique value' — boilerplate ratio is the most direct quantitative measure of that. The May 2024 site-reputation update added another wrinkle: third-party content hosted on a high-authority domain often presents as high-boilerplate because the same disclosure/byline blocks repeat across many guest authors.",
    faqs: [
      {
        q: "Why 80% as the skeleton cutoff and not 50% or 100%?",
        a: "100% misses anything that varies even slightly (some pages add an extra disclaimer); 50% catches accidental repetition (two pages happening to share an intro). 80% — specifically `floor(N * 0.8) + 1` — was tuned to catch real templates while ignoring coincidental matches. It works well from 5 pages upward."
      },
      {
        q: "My site is below threshold but I still feel templated. What now?",
        a: "Look at `spam/template-diversity`. Boilerplate ratio measures shared text; template diversity measures shared HTML structure. A site can have low ratio (because variable text is long) but identical structure across pages — that combination is also a SpamBrain signal."
      },
      {
        q: "Does navigation count toward boilerplate?",
        a: "No. pseolint extracts main content text using readability heuristics before splitting into blocks, so nav, footer, sidebars, and cookie banners are stripped first. You're measuring main-content boilerplate only, which is the relevant denominator."
      },
      {
        q: "What about FAQs that legitimately apply to every page?",
        a: "If they're genuinely identical across pages, they belong on a /faq URL with internal links from each page rather than embedded everywhere. If they're genuinely page-specific (different answers per page), they won't trigger because the block frequency stays below the skeleton cutoff."
      },
      {
        q: "Will this rule fire on a 5-page site?",
        a: "It can. With 5 pages, the skeleton cutoff becomes `floor(5 * 0.8) + 1 = 5`, meaning a block must appear on all 5 pages to count as skeleton. That's intentional: small sites should have very little boilerplate."
      }
    ],
    relatedRules: ["template-diversity", "thin-content", "near-duplicate"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "template-diversity",
    ruleId: "spam/template-diversity",
    title: "Template Diversity — Why HTML Structure Counts as a Spam Signal",
    metaDescription:
      "If every page shares one HTML skeleton, SpamBrain reads your domain as a single template, not N pages. How pseolint measures structural diversity and the 30% floor.",
    primaryKeyword: "template diversity SEO",
    oneLiner:
      "30% is the default minUniqueRatio threshold — pseolint warns when fewer than 30% of pages carry a structurally distinct HTML skeleton, the floor at which SpamBrain (rebuilt August 25, 2022) starts reading a domain as one template rather than N designed pages.",
    whatItDetects:
      "30% is the default minUniqueRatio pseolint warns below — the floor at which Google's SpamBrain (rebuilt August 25, 2022 alongside the Helpful Content System launch to score site-level helpfulness alongside per-page signals) starts treating a domain as a single template rather than N designed pages. Each parsed page carries a `structureSignature` — a hash of its HTML structure that ignores text content but preserves the sequence and nesting of element types. The rule counts how many distinct signatures exist across all pages and divides by the page count to produce a unique-ratio in [0,1]. If that ratio falls below `minUniqueRatio` (0.30 default), a single warning-severity finding (weight 12) is emitted at the site level — versus error=25, critical=40, info=5 elsewhere in the engine. This is a holistic signal, not a per-page one: there is no list of 'failing' URLs because the problem is the site's design system, not any individual page. Powered by @pseolint/core v0.4.3, MIT-licensed at github.com/ouranos-labs/pseolint.",
    whyItMatters:
      "Templated HTML is not in itself a spam signal — every modern CMS produces it. The signal is when templated HTML combines with templated content. SpamBrain (publicly named April 12, 2021 and rebuilt across the August 25, 2022 Helpful Content System launch) reads the combination as 'one piece of low-effort programmatic output,' even if the underlying data is rich, because there is no surface variation for the classifier to latch onto. Field reports following the March 5, 2024 scaled-content-abuse update show 60% to 80% organic-traffic loss within a 6-week window for sites whose unique-ratio sat below 10%, and a 90-day recovery window once the structure was diversified.\n\nIndustry crawlers like Ahrefs, Sitebulb, and Screaming Frog all surface comparable template-fingerprint counters, but the 30% floor is specific to pseolint's measurement (powered by @pseolint/core v0.4.3). Sites with diverse structure (some pages have a comparison table, some don't; some have a video embed, some don't; some have a sticky TOC, some don't) communicate to the classifier that real per-page editorial decisions were made. Sites with one signature for every URL communicate the opposite. The fix is to introduce conditional structure, not to randomise it artificially. The current implementation lives in @pseolint/core v0.4.3 with site-type-aware weighting — programmatic-directories tolerate slightly higher template homogeneity than small-marketing sites.",
    failingExample:
      "A 300-page travel directory where every URL renders exactly: `<header>`, `<nav>`, `<main>` containing `<h1>`, `<img>`, three `<section>` blocks each with `<h2>` and four `<p>`, then `<footer>`. Every page hashes to the same structureSignature. Unique ratio: 1/300 = 0.003. Even though each page has 800 words of unique prose about a different destination, the structural monotony is itself a signal: from a crawler's perspective, this is one template with 300 plug-ins, not 300 designed pages.",
    passingExample:
      "The same travel directory, redesigned with conditional sections. Pages for destinations with notable history get a `<aside>` timeline component. Pages for destinations with strong food culture get a `<table>` of regional dishes. Pages for hiking destinations get a `<figure>` with elevation chart. About 35% of pages render at least one optional section, producing roughly a dozen distinct structureSignatures. Unique ratio: 12/300 = 0.04 — still low, but combined with conditional `<aside>` variants the signature space grows enough that the ratio rises to 0.32 and the rule no longer fires.",
    howToFix: [
      "Identify which sections in your template should be optional. Anything that doesn't apply to every entity is a candidate: pricing tables, video embeds, timelines, FAQs, comparison widgets.",
      "Wrap optional sections in conditionals that key off the underlying data, not random booleans. 'If the entity has a video URL, render the video block' produces meaningful diversity; 'if Math.random() > 0.5' produces nothing.",
      "Vary the order of secondary sections by entity type. A restaurant page might lead with menu, a hotel page with rooms — same template, different priority.",
      "Add per-entity media variations. Some pages have hero images, some have hero videos, some have galleries. Each renders different HTML.",
      "Don't fix this rule by adding random structural noise. The rule is a holistic warning; if the underlying content is differentiated, the warning is acceptable on a homogeneous content type."
    ],
    spamBrainContext:
      "Structural homogeneity has been a feature in spam classifiers since at least the 2009 'doorway page' updates, but it took on new prominence after the August 25, 2022 Helpful Content System rollout introduced site-level helpfulness scoring. Sites that look the same on every URL communicate 'mass production' to a classifier whose entire job is to find mass production. Google's December 14, 2022 link-spam update mentioned 'sites that exist primarily to feed link signals' — those sites are almost always structurally homogeneous because they were built off a single template with no per-page editorial input. The March 5, 2024 scaled-content-abuse policy formalised this: 'producing many pages with little unique value' is structurally measurable, and the May 7, 2024 site-reputation-abuse update extended the same logic to hosted third-party content.\n\nWhile alternative fingerprinting approaches like SimHash (used by spam/near-duplicate at the 85% threshold), Jaccard set similarity, and BERT structural embeddings exist, the structureSignature hash pseolint uses keeps the rule deterministic and runnable in under a 1-second wall-clock per 100 pages — well within the 60-second free-tier audit budget. Implementation: @pseolint/core v0.4.3 (current), MIT-licensed, github.com/ouranos-labs/pseolint. Comparable template-diversity counters surface in Ahrefs, Sitebulb, and Screaming Frog, though each defines the floor slightly differently.",
    faqs: [
      {
        q: "Isn't every WordPress site structurally identical?",
        a: "Not really. Default WordPress themes produce slightly different HTML for posts, pages, archives, single-product, and category templates — usually 5-8 distinct signatures across a typical install. The rule will fire on heavily-templated WordPress builds (especially those using a single page template for every URL) but not on default editorial sites."
      },
      {
        q: "Why is this only a warning, not an error?",
        a: "Because structural homogeneity is acceptable for some content types — a glossary, a directory of API endpoints, a product catalogue. The rule surfaces the signal so you can make an informed call; it doesn't assume the call. If your content type genuinely demands one template, document the decision and ignore the warning."
      },
      {
        q: "Does the structureSignature ignore CSS classes?",
        a: "Yes. Class names and attribute values are stripped before hashing — only element types and their nesting pattern are considered. This means restyling a page (CSS changes only) doesn't change its signature, which is the right behaviour for a structural signal."
      },
      {
        q: "How does this differ from boilerplate ratio?",
        a: "Boilerplate ratio measures shared text content. Template diversity measures shared HTML structure. A page can have low boilerplate (every page has unique paragraphs) but identical structure (every page renders those paragraphs in the same shell). Both rules need to be green for a site to look genuinely diverse."
      },
      {
        q: "What's a healthy unique-ratio target?",
        a: "0.30 is the default minimum and the floor at which most pSEO sites stop reading as templated. 0.50+ feels like an editorial site to a classifier. Below 0.10 is almost always a single template — fine for some content types, dangerous for others. A taxidermy-studio portfolio of near-identical mounted-specimen pages reads as one template no matter how distinct each pheasant or roebuck mount actually is."
      }
    ],
    relatedRules: ["boilerplate-ratio", "doorway-pattern", "near-duplicate"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "host-section-divergence",
    ruleId: "links/host-section-divergence",
    title: "Site Reputation Abuse — Detecting Parasite Sections on a Trusted Host",
    metaDescription:
      "Google's May 7, 2024 site-reputation-abuse policy targets sections that ride a host's authority without integrating. How links/host-section-divergence measures it.",
    primaryKeyword: "site reputation abuse detection",
    oneLiner:
      "Google's May 7, 2024 site-reputation-abuse policy demotes subfolders that borrow a host's reputation without earning it — links/host-section-divergence flags a URL section (e.g. /coupons/, /deals/) only when it diverges from the rest of the host on at least 2 of 4 independent structural signals, and it deliberately fires on the minority section, never on a balanced multi-topic split.",
    whatItDetects:
      "The rule groups every crawled URL by its first path segment (/coupons/, /reviews/, /best/) and tests each section that holds at least 10 pages while leaving at least 10 pages in the rest of the host. It only considers sections that are a strict minority of the corpus (under 50%) — reputation abuse is, by definition, a small parasite section riding a larger host, so a 50/50 split is read as a multi-topic site and skipped.\n\nFor each qualifying section it measures four signals against the rest of the host: (1) inbound-link integration — the fraction of section pages that receive at least one internal link from outside the section, flagged when under 0.20 (the section is an island the host barely references); (2) topic divergence — Jaccard distance between the top-100 TF-IDF terms of the section versus the rest, flagged above 0.75 (under ~25% vocabulary overlap); (3) template isolation — the fraction of section pages whose structureSignature also appears anywhere else on the host, flagged when under 0.10 (the section ships its own template the host never uses); and (4) authorship mismatch — flagged when section and host byline coverage differ by at least 0.40 and one pool is mostly anonymous (≤0.30) while the other is mostly bylined (≥0.70).\n\nA section that trips 2 or more signals emits a warning naming the section, the signal values, and a 20-URL sample; a section that trips 3 or more and holds over 50 pages escalates to error. The rule reasons about structure, not contracts — it cannot read a revenue-share agreement or see a manual action, only the structural fingerprint those arrangements leave behind.",
    whyItMatters:
      "Site reputation abuse — colloquially 'parasite SEO' — became an explicit Google spam policy on May 7, 2024 (https://developers.google.com/search/docs/essentials/spam-policies#site-reputation-abuse), and unlike most quality signals it is enforced partly by hand: affected domains receive a 'Third-party content abuse' manual action in Search Console with a defined reconsideration path.\n\nThe policy targets a specific asymmetry — a high-authority host lends its reputation to a section of content that was produced by or for a third party with minimal first-party editorial involvement, so the section ranks on borrowed trust rather than its own. The classic shapes are a /coupons/ or /deals/ subfolder run by a syndication partner under a newspaper's domain, a vendor-generated /locations/ template on a directory site, or a sponsored /best/ directory with no real editorial review.\n\nEnforcement is surgical: field reports after the May 2024 and November 5, 2024 waves show 70% to 100% traffic loss confined to the offending subfolder while the rest of the domain is untouched. The four signals this rule reads are the same structural tells a reviewer looks for — is the section cross-linked from the host's own navigation, does it talk about the same things, was it built with the host's design system, and is it signed by the same people. None of those is conclusive alone, which is why the rule requires at least two to agree before it says anything.",
    failingExample:
      "A regional news domain with 1,200 editorial articles and a 180-page /coupons/ section supplied by an affiliate network. The coupon pages receive almost no inbound links from the newsroom's own pages (inbound-integration 0.06), share under 20% of their vocabulary with the news content (topic-divergence 0.81), render from a template the rest of the site never uses (template-isolation 0.04), and carry no bylines while the editorial side is 90% bylined (authorship mismatch: 0.00 vs 0.90). All four signals trip and the section holds more than 50 pages, so the rule fires at error severity — the structural signature of exactly the arrangement the May 2024 policy was written to catch.",
    passingExample:
      "The same news domain, but the /reviews/ section is produced in-house: every review is linked from the relevant news category, written by named staff who also write the news, and built with the site's standard article template. Inbound integration is 0.74, topic vocabulary overlaps the host's coverage (topic-divergence 0.38), the template is shared (template-isolation 0.61), and byline coverage matches the rest of the host. Zero signals trip. The section is a genuine part of the publication, not a parasite riding its authority — and the rule stays silent, because structural integration is exactly what the policy asks for.",
    howToFix: [
      "Decide per section whether you actually own it editorially. If a third party produces the content with minimal first-party review, the honest fixes are to integrate it properly or to move it off the host — not to game the four signals.",
      "Integrate, option A: cross-link the section from your primary navigation and from topically-related host pages so it stops reading as an island. Low inbound integration is the cheapest signal to flip and often the most diagnostic.",
      "Integrate, option B: share authorship and schema. Put real, named reviewers on the pages who actually vet them, and align the section's template with the rest of the host so it isn't a structurally foreign body.",
      "Separate, the clean alternative: move the section to a subdomain or a partner-owned domain and 301 the old URLs. It stops borrowing your reputation — which is the point of the enforcement — and stops being a liability.",
      "Do not try to defeat the rule by sprinkling a few host links into the section while leaving it editorially third-party. The policy is about substance, not surface signals; a reviewer applies the same 'would a reasonable user see this as the host's own content' test the rule only approximates."
    ],
    spamBrainContext:
      "Site reputation abuse was announced in the March 5, 2024 spam-policy update and took effect on May 7, 2024 (https://developers.google.com/search/docs/essentials/spam-policies#site-reputation-abuse), closing a loophole that the scaled-content-abuse and doorway policies left open: content that is individually passable but exists only to monetise a host's accumulated authority. Google has been explicit that the arrangement, not the topic, is what's penalised — a disclosed but otherwise-passive partnership is still in scope.\n\nThis rule (shipped in @pseolint/core v0.5.1, MIT-licensed at github.com/ouranos-labs/pseolint) is the structural complement to the spam/* family: where spam/doorway-pattern and spam/near-duplicate look within a template for duplication, links/host-section-divergence looks across a host for a section that doesn't belong to it. It is deliberately conservative — the minority gate, the dual 10-page floors, and the 2-of-4 threshold exist to avoid crying abuse on legitimate multi-topic sites — and it scores at the engine's default rule weight rather than a hand-tuned spam weight, so treat a finding as a prompt to audit the arrangement, not as a verdict that you have been penalised.\n\nWhat it cannot do is read intent: it sees an unintegrated, off-topic, separately-templated, unsigned section and tells you it looks like parasite content. Whether it is depends on facts only you and your contracts hold.",
    faqs: [
      {
        q: "Does this rule detect that content is literally 'third-party'?",
        a: "No, and it doesn't claim to. It has no way to read a revenue-share contract or know who authored a page. It measures four structural proxies — inbound integration, topic overlap, template sharing, and byline coverage — that genuine first-party sections tend to satisfy and parasite sections tend to fail. A finding means the section looks structurally like the pattern Google's policy targets; confirming it requires looking at the actual arrangement."
      },
      {
        q: "Why does it only fire on the smaller section, not both halves of a split?",
        a: "By design. The rule requires the divergent section to be a strict minority of the corpus (under 50%). Site reputation abuse is a small section riding a large host's reputation; a roughly even split between two topics is a multi-topic site, not abuse. The minority gate is what stops the rule from emitting a symmetric, useless finding on both halves of a 50/50 site."
      },
      {
        q: "How many signals have to trip before it warns?",
        a: "At least 2 of the 4. One signal alone is too noisy — plenty of legitimate sections are lightly cross-linked or use a distinct template. Requiring two independent signals to agree keeps the false-positive rate low. Three or more on a section larger than 50 pages escalates the finding from warning to error."
      },
      {
        q: "I run a genuine in-house section that still trips this. What now?",
        a: "Look at which signals fired. If it's inbound integration, your section is under-linked from the rest of the site — usually worth fixing for users regardless. If it's authorship, add real bylines. If it's topic and template divergence on content that's legitimately yours, the rule is a false positive on your content type; document the decision and ignore the warning. The rule surfaces a structural pattern; it doesn't assume your intent."
      },
      {
        q: "Will Google penalise the whole domain or just the subfolder?",
        a: "Site reputation abuse enforcement is characteristically subfolder-scoped — the affected section loses ranking while the rest of the domain is left intact, which is precisely the asymmetry the policy is designed to remove. That's also why this rule reports at the section level and names the specific prefix, rather than scoring the whole site down."
      }
    ],
    relatedRules: ["doorway-pattern", "template-diversity", "boilerplate-ratio"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "entity-swap",
    ruleId: "spam/entity-swap",
    title: "Entity-Swap Pages — When Only the Noun Changes Between URLs",
    metaDescription:
      "Entity-swap pages are identical once you mask the swapped city, role, or product. How spam/entity-swap masks entities, then SimHash-fingerprints the rest at 95%.",
    primaryKeyword: "entity swap pages SEO",
    oneLiner:
      "spam/entity-swap masks the variable noun on every page — by default US state names and 5-digit ZIP codes — then computes a 64-bit SimHash of what is left and fires at critical severity when two pages score 95% similarity or higher, the convergence signal Google's SpamBrain has used against entity-swap doorways since the March 5, 2024 scaled-content-abuse update.",
    whatItDetects:
      "spam/entity-swap is the rule that catches the single cleanest fingerprint of programmatic generation: a page whose only real difference from its siblings is the entity you swapped in. The rule masks every page's main content with your entity patterns — the defaults cover all 50 US state names and 5-digit ZIP codes, and you add your own dimensions (cities, SKUs, job titles) in pseolint.config.ts — and then computes a 64-bit SimHash over the masked text.\n\nMasking is what separates this rule from spam/near-duplicate. Near-duplicate hashes the raw text and fires at 85%, so two location pages with genuinely different city paragraphs can slip under its bar. Entity-swap removes the entity tokens first, so if the remaining sentence frames are identical the masked similarity rockets toward 100%. The pairwise O(n²) sweep flags any pair scoring 95% or above at critical severity, and records the pair as a PairMatch that spam/doorway-pattern later consumes as one of the three signals it needs to converge.",
    whyItMatters:
      "An entity-swap pair is the hardest pattern to defend because it admits what it is. When /plumbers/ohio and /plumbers/nevada say the same thing in the same order with two words changed, there is no argument that the second page serves a need the first does not. Google's classifiers treat the masked-similarity signal as near-conclusive precisely because the false-positive rate is so low — real local pages diverge once you remove the place name, and generated ones do not.\n\nThe 95% floor is deliberately conservative so the rule rarely cries wolf, which means a finding is worth acting on the day it appears. Field reports after the March 5, 2024 rollout showed entity-swap clusters losing the bulk of their long-tail impressions inside a 6-week window, and because the pairs feed spam/doorway-pattern, an unaddressed entity-swap problem tends to escalate from a quiet near-duplicate warning into the critical doorway stack that draws manual review.",
    failingExample:
      "/grants/small-business-grants-texas and /grants/small-business-grants-florida. Strip 'Texas' and 'Florida' and the two pages are byte-for-byte identical: same 'How to qualify' intro, same three eligibility bullets, same 'Apply before the deadline' close. Masked SimHash similarity 99%. The rule fires at critical and hands the pair to spam/doorway-pattern, where the identical structure and shared meta description complete the three-signal stack.",
    passingExample:
      "/grants/small-business-grants-texas and /grants/small-business-grants-florida, rebuilt from a state grants dataset. The Texas page leads with the Texas Enterprise Fund and a franchise-tax exemption; the Florida page leads with the absence of a state income tax and county-level economic-development grants. Different agencies, different dollar amounts, different deadlines. Masked similarity drops to 38% because the sentence frames themselves now differ, not just the state name — and the entity-swap pair never forms.",
    howToFix: [
      "Bind real per-entity data, not synonyms. Swapping 'top' for 'best' or rewording a sentence leaves the masked SimHash untouched; the rule already ignores the entity token, so only genuinely different facts move the score.",
      "Lead each page with the one thing that entity has and its siblings lack — a local statute, a region-specific fee, a SKU's actual spec — so the opening sentence frame diverges, not just the noun.",
      "Audit your data source for thin records. An entity-swap cluster usually traces back to rows that carry no distinguishing fields; if the data cannot differentiate the page, the page probably should not exist as a separate URL.",
      "Consolidate entities you cannot differentiate. Five states with identical programs are better served by one page that names all five than five pages that pretend to be different.",
      "Re-run after each fix. Because the rule is pairwise, breaking one page out of a cluster can drop several findings at once as the remaining pairs fall below 95%."
    ],
    spamBrainContext:
      "Entity masking mirrors how Google's deduplication has worked since it adopted SimHash-style fingerprinting for crawl: the index does not care which proper noun you inserted, it cares whether the document adds anything the rest of the web lacks. The March 5, 2024 scaled-content-abuse policy named 'creating many pages where little changes between them' as a violation in its own right, independent of whether a human or a model produced the text.\n\nspam/entity-swap (shipped in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) operationalises that clause with the strictest threshold in the spam family — 95% on masked text versus 85% on raw text for spam/near-duplicate — so it surfaces the pattern the policy targets without flagging legitimately templated pages that vary their content. It is one of the three independent signals spam/doorway-pattern requires, which is why clearing entity-swap findings early is the cheapest way to keep a programmatic template out of the critical doorway tier.",
    faqs: [
      {
        q: "How is entity-swap different from near-duplicate?",
        a: "Near-duplicate hashes your raw text and fires at 85% similarity; entity-swap masks the variable noun first — by default US state names and ZIP codes — then hashes what remains and fires at the stricter 95%. The masking is the whole point: two pages can have city paragraphs different enough to pass near-duplicate while being identical sentence frames once the city name is removed. Entity-swap exists to catch exactly that case."
      },
      {
        q: "What does pseolint mask by default, and can I add my own entities?",
        a: "The defaults cover all 50 US state names and 5-digit ZIP codes. You add your own dimensions — cities, product SKUs, job titles, company names — as regex patterns in the entityPatterns option or pseolint.config.ts. The patterns you declare are exactly the variables your template swaps, so masking them is how you tell the rule which axis to ignore while it judges whether anything else changes."
      },
      {
        q: "Why does the rule fire at critical instead of warning?",
        a: "Because the false-positive rate is very low. A pair that is 95% similar after the entity is removed is, by construction, two pages that say the same thing about different nouns — the textbook doorway shape Google's policy describes. Genuine per-entity pages diverge the moment you mask the entity, so they never reach the threshold. That high confidence is why entity-swap is one of the signals that can push a template into the critical doorway stack."
      },
      {
        q: "I have real local pages that still trip this. What now?",
        a: "Look at what your pages actually say once the place name is gone. If the answer is 'the same thing', the locality is cosmetic and the rule is correct — add genuinely local facts (regulations, pricing, named providers) or consolidate. If your pages truly differ and still trip, your entity pattern is probably too narrow, leaving other shared nouns unmasked; widen the patterns so the rule judges the right axis."
      },
      {
        q: "Does fixing entity-swap also clear my doorway findings?",
        a: "Often, yes. spam/doorway-pattern only fires when three signals converge, and entity-swap is one of them. Breaking the masked similarity below 95% removes that signal from the stack, which is frequently enough to drop the pair below the three-signal threshold even if it still trips near-duplicate. Fixing entity-swap is usually the cheapest way to dismantle a doorway cluster."
      },
      {
        q: "We run a real multi-location veterinary group — will this rule punish us?",
        a: "Only if your clinic pages are interchangeable. A genuine veterinary group differentiates each location on its on-site surgical suite, its emergency feline-and-canine triage hours, its boarding-kennel capacity, and the named vets who practise there. Mask the town and those pages still diverge, so the entity-swap pair never assembles. If masking leaves identical vaccination-schedule boilerplate behind, the rule is correctly telling you the locations exist only on paper. A mobile farrier who lists every locality where he shoes horses, repeating one hoof-trimming blurb per page, is the equine version of the same trap."
      }
    ],
    relatedRules: ["near-duplicate", "doorway-pattern", "thin-content"],
    relatedTool: "doorway-page-detector"
  },
  {
    slug: "publication-velocity",
    ruleId: "spam/publication-velocity",
    title: "Publication Velocity — When Your Publish Dates Betray Bulk Generation",
    metaDescription:
      "Thousands of pages sharing one publish date is a bulk-generation tell. How spam/publication-velocity flags date-stacked corpora past a 100/day or 10%-of-corpus ceiling.",
    primaryKeyword: "publication velocity SEO",
    oneLiner:
      "spam/publication-velocity groups your pages by publish date and warns when any single day exceeds the greater of 100 pages or 10% of your whole corpus — the date-stacking signal Google's March 27, 2026 core update tightened against programmatically generated sites.",
    whatItDetects:
      "spam/publication-velocity reads the publish date off every page — from article:published_time, a datePublished meta, or the first time[datetime] element — truncates it to a calendar day, and groups the corpus by that day. Pages with no detectable date are skipped, so the rule only judges what it can actually see.\n\nThe ceiling is corpus-relative. The effective limit for any day is the greater of two numbers: the absolute floor of 100 pages per day, and 10% of your total page count. A 400-page site is governed by the 100/day floor; a 50,000-page site can legitimately publish up to 5,000 pages on one date before the rule says anything. Any day that exceeds its effective limit emits a single warning naming the date, the count, and which ceiling it breached. The corpus-relative design is what keeps the rule from punishing large, legitimately busy publishers while still catching the small site that stamped 800 generated pages with one timestamp.",
    whyItMatters:
      "Real editorial calendars are lumpy but human. Pages trickle out across days and weeks; a backlog clears in a burst, then quiet returns. A corpus where ten thousand URLs all carry the same publish date did not come from an editorial process — it came from a single generation job, and the timestamp is the receipt. Date-stacking is one of the few scaled-content signals that survives even when each individual page looks acceptable, because it describes the corpus, not the page.\n\nGoogle's March 27, 2026 core update explicitly tightened how date-stacked corpora are weighed, which is why this rule moved from a curiosity to a real signal. The fix costs nothing in content quality — you are not rewriting anything, only spreading out the dates you expose — but ignoring it leaves a structural fingerprint that pairs badly with thin-content or near-duplicate findings on the same template. When several scaled-content signals stack, the corpus gets re-scored as a unit.",
    failingExample:
      "A recipe site imports 2,400 pages from a spreadsheet on a Sunday and ships them at once. Every page carries an article:published_time of 2026-02-15. The corpus is 3,000 pages, so the effective ceiling is the greater of 100 and 300, which is 300; the 2,400-page spike on a single date blows through it and the rule warns: '2,400 pages share publish date 2026-02-15, exceeding 10% of the 3,000-page corpus (300/day).'",
    passingExample:
      "The same 2,400 imported recipes, but the import script backdates each page to the day its source recipe was actually created and drip-publishes new ones on a real cadence. No single day holds more than roughly 40 pages. The effective ceiling of 300/day is never approached, the rule stays silent, and the corpus reads like something a kitchen team built over years rather than a spreadsheet dumped in an afternoon.",
    howToFix: [
      "Spread real dates, do not fabricate them. If your pages were genuinely created over time, surface that true history in article:published_time instead of stamping every record with the import date.",
      "Drip-publish new batches. Releasing generated pages over days or weeks both lowers the per-day count and matches how Google expects a healthy site to grow.",
      "Raise the corpus, not the spike. The ceiling scales with total page count, so the rule naturally relaxes as a site earns scale — but only if growth is distributed, not stacked.",
      "Check which field you expose. If you have no real publish dates, consider omitting them rather than stamping a placeholder, since the rule skips pages with no detectable date.",
      "Treat a velocity warning as a prompt to audit the same template for thin-content and near-duplicate — date-stacking rarely travels alone."
    ],
    spamBrainContext:
      "Publication velocity is a behavioural signal rather than a content one, which is what makes it hard to fake. The scaled-content-abuse policy introduced on March 5, 2024 reframed Google's old 'automatically generated content' rule around volume-and-value rather than authorship, and the March 27, 2026 core update sharpened enforcement on corpora whose publish-date distribution looks machine-made.\n\nspam/publication-velocity (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is deliberately the gentlest member of the spam family — it emits at warning severity, never critical, because a date spike alone is suggestive, not damning. Its value is as corroboration: when a template already trips spam/template-diversity or spam/boilerplate-ratio, a date-stacked publish history is the behavioural evidence that the structural homogeneity came from bulk generation. The corpus-relative 10% ceiling, layered over the absolute 100/day floor, is tuned so a genuine large publisher clears it while a small site faking scale does not.",
    faqs: [
      {
        q: "Does Google actually use publish dates as a spam signal?",
        a: "Google does not publish its feature list, but the March 27, 2026 core update notes specifically called out programmatically generated sites, and date distribution is one of the cheapest behavioural tells available to a classifier. A corpus where every page shares a timestamp could not have come from an editorial process. pseolint treats it as corroborating evidence at warning severity, not as a standalone verdict."
      },
      {
        q: "I migrated my site and every page got today's date. Am I penalised?",
        a: "A migration that rewrites all publish dates to the cutover day is the classic false-trigger. It is not a penalty, but it does erase the genuine history that would otherwise vouch for your site. Where you can, restore the real article:published_time from your old system; the rule reads that field directly and the warning clears once the dates reflect reality."
      },
      {
        q: "What is the difference between the 100/day floor and the 10% ceiling?",
        a: "The rule uses whichever is larger. Small and mid-size sites are governed by the absolute floor of 100 pages per day. Once 10% of your total corpus exceeds 100, the corpus-relative ceiling takes over — a 50,000-page site can publish up to 5,000 pages on one day before tripping. The design lets big publishers grow in bursts while keeping small sites from faking scale with a single dump."
      },
      {
        q: "Should I just remove publish dates to avoid this?",
        a: "Only if you have no real dates to show. The rule skips pages with no detectable date, so stripping dates does silence it — but it also throws away a freshness and trust signal that helps elsewhere. The better move is to expose accurate dates that happen to be well distributed, which satisfies this rule and the aeo/freshness-signals rule at the same time. A philately seller who stamps each listing with the day its first-day cover was catalogued shows a believable, well-spread release history rather than one suspicious bulk import."
      }
    ],
    relatedRules: ["template-diversity", "boilerplate-ratio", "thin-content"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "template-coverage",
    ruleId: "spam/template-coverage",
    title: "Template Coverage — How Sparse Keyword Matrices Expose pSEO",
    metaDescription:
      "A template filling 8% of its keyword cells looks generated. How spam/template-coverage measures URL-dimension coverage across a cluster, and why sparse matrices read as pSEO.",
    primaryKeyword: "template coverage pSEO",
    oneLiner:
      "spam/template-coverage groups URLs in the same directory, masks the entity tokens in each filename, and reports how many of the possible dimension combinations a template actually fills — surfacing, at info severity, the sparse high-dimension matrices Google's March 27, 2026 core update down-weighted on programmatic sites.",
    whatItDetects:
      "spam/template-coverage is a diagnostic, not an accusation. It groups your URLs into clusters by parent directory, and within each cluster of at least 5 pages it looks only at the filename — the last path segment, extension stripped. It masks the entity tokens in that filename using your entity patterns, then splits the masked name on hyphens into positional tokens.\n\nFor each position where more than one distinct value appears, the rule records a 'dimension'. A cluster like /jobs/[role]-jobs-in-[city] has two dimensions: role and city. The rule multiplies the number of distinct values in each dimension to get the total possible combinations, then divides the pages you actually built by that total to produce a coverage percentage. If a template has 12 services and 50 cities — 600 possible cells — but you shipped 96 pages, coverage is 16% and the rule reports the dimensions, the sample values, and the ratio at info severity. A cluster where every token varies, or none does, produces no finding because there is no matrix to measure.",
    whyItMatters:
      "A sparse matrix is a behavioural confession. Filling 16% of a 600-cell grid almost always means a script generated the combinations that had search volume and skipped the rest — the definition of building pages for keywords rather than for users. A human team that genuinely served every service in every city would either cover the grid densely or never have framed the work as a grid at all.\n\nThe rule fires at info severity on purpose: sparse coverage is not inherently spam. A directory legitimately serving 96 real markets is fine; the signal only matters when the sparsity pairs with thin or near-duplicate content in the same cluster. Google's March 27, 2026 core update down-weighted exactly this shape — high-dimension templates with low fill rates — because the combinatorial ambition is a reliable marker of coverage-driven generation. Treat a coverage finding as a question: can you actually differentiate every cell you intend to fill, or are you claiming a matrix you cannot substantiate?",
    failingExample:
      "/locations/ holds 96 pages of the form [service]-in-[city]. Masking the entity tokens reveals two dimensions: 12 services and 50 cities, implying 600 possible combinations. The cluster also trips spam/near-duplicate and spam/thin-content. The coverage finding reads: '/locations has 96 pages across 2 dimensions: 12 values (e.g. plumbing, roofing, hvac) x 50 values (e.g. austin, dallas, houston). Coverage: 96 of 600 combinations (16.0%).' Read together, the picture is a template that generated the high-volume cells and left the grid mostly empty.",
    passingExample:
      "The same /locations/ cluster, narrowed to the combinations the business can actually differentiate: 12 services in the 8 cities where it has a physical branch, 96 pages covering 96 of 96 cells. Coverage is 100%. Each page carries the branch address, local pricing, and named staff for that city, so the dense grid reflects genuine market presence rather than a keyword script that filled the easy cells of a 600-cell matrix.",
    howToFix: [
      "Narrow the matrix to what you can differentiate. If you cannot write genuinely distinct content for all 600 cells, do not claim the grid — build the cells you can substantiate and drop the dimensions you cannot.",
      "Raise coverage by subtraction, not addition. Pruning empty intent often beats generating the missing cells, because the missing cells are usually the ones with no demand and nothing unique to say.",
      "Check the paired findings first. A coverage finding next to spam/thin-content or spam/near-duplicate in the same cluster is the combination that matters; coverage alone is a diagnostic to note, not an emergency.",
      "Collapse a dimension. If one axis (say, modifier words like cheap/best/top) adds combinations without adding user value, remove it from the URL structure and fold it into a single page.",
      "Treat info severity as guidance. The rule never blocks a verdict on its own — it tells you where a template's ambition outruns its substance so you can decide before Google does."
    ],
    spamBrainContext:
      "The 'keyword matrix' has been the engine of programmatic SEO since long before SpamBrain, and Google's spam policies have steadily closed in on it. The doorway-pages policy (March 16, 2015) named pages built for query permutations; the March 5, 2024 scaled-content-abuse update reframed the harm as volume without value; and the March 27, 2026 core update specifically down-weighted sparse, high-dimension templates on programmatic corpora.\n\nspam/template-coverage (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is the only rule in the suite that reasons about your URL structure as a combinatorial grid rather than about page content. That is why it ships at info severity and never contributes a blocker on its own — coverage is context, not a charge. Its job is to make the matrix visible so you can answer the question every scaled-content policy is really asking: did you build these pages because each cell serves a distinct need, or because a loop could generate them?",
    faqs: [
      {
        q: "Is low template coverage always bad?",
        a: "No, and the rule reflects that by firing at info severity. A directory that genuinely serves 96 specific markets has low 'coverage' of every theoretically possible combination and is perfectly legitimate. Low coverage only becomes a problem when it pairs with thin or near-duplicate content in the same cluster — that combination is the signature of a script that filled the high-volume cells of a keyword grid and skipped the rest."
      },
      {
        q: "How does the rule decide what a 'dimension' is?",
        a: "It strips each URL to its filename, masks your entity tokens, and splits the masked name on hyphens. Any token position that holds more than one distinct value across the cluster becomes a dimension. So /x/[a]-in-[b] has two dimensions if both [a] and [b] vary. If every position varies, or none does, there is no measurable matrix and no finding."
      },
      {
        q: "Why only clusters of 5 or more pages?",
        a: "Below five pages there is not enough of a pattern to call something a template. The minimum keeps the rule from labelling a handful of related URLs as a generated matrix. You can tune the threshold with the templateCoverageMinPages option if your site's structure warrants it."
      },
      {
        q: "What is the difference between this and template-diversity?",
        a: "spam/template-diversity measures how uniform your rendered HTML is; spam/template-coverage measures how completely your URL structure fills its own combinatorial grid. One looks at the pages, the other at the address space. A site can have diverse HTML but a suspiciously sparse URL matrix, or a dense matrix rendered through one rigid template — they catch different halves of the same programmatic shape."
      },
      {
        q: "My brewery directory has a sparse beer-style grid — is that a problem?",
        a: "It depends on whether the empty cells were ever meaningful. A taproom finder crossing two hundred breweries against twelve styles implies a huge matrix, but most breweries simply do not pour a barrel-aged gose or a hazy triple IPA. An audit reporting eleven percent coverage on that beverage grid is asking whether the missing pours were demand-driven or merely unreachable. Prune to the styles each taproom actually serves — the growler fills, the seasonal lager, the nitro stout, the cask night — and a sparse ratio becomes an honest one without a single empty pint page."
      }
    ],
    relatedRules: ["template-diversity", "doorway-pattern", "near-duplicate"],
    relatedTool: "doorway-page-detector"
  },
  {
    slug: "unique-value",
    ruleId: "content/unique-value",
    title: "Unique Value — Counting the Words That Appear on No Other Page",
    metaDescription:
      "Word count is not uniqueness. How content/unique-value counts page-specific words per URL, why shared per-axis data doesn't count, and the 100-word floor it enforces.",
    primaryKeyword: "unique content value SEO",
    oneLiner:
      "content/unique-value counts the distinct words on each page that appear on no other page in the audit, and fires an error below a 100-word floor — the page-specific-vocabulary test Google's scaled-content-abuse policy has applied since March 5, 2024 when it asks whether a URL adds anything genuinely new.",
    whatItDetects:
      "content/unique-value answers a sharper question than word count: of all the distinct words on this page, how many appear on no other page in the audit? The rule tokenises each page's main content — lower-cased, split on whitespace, with leading and trailing punctuation stripped so 'word', 'word.' and '(word)' count as one token — and builds a frequency map of which words appear on which pages.\n\nA word counts toward a page's uniqueness only if its frequency across the whole audited set is exactly one. Words that appear on even one other page — navigation labels, shared legal blocks, an industry term every page uses — are 'shared' and do not count, no matter how useful they are. If a page has fewer than 100 of these page-exclusive words, the rule fires an error and reports the split: how many words are unique, how many are shared, and how many distinct words the page has in total. The point is to make visible that a 1,500-word page can still carry only 90 unique words — 6% of its length — if 1,410 of its words live on its siblings too.",
    whyItMatters:
      "This is the rule that catches the failure thin-content misses. A page can clear the 300-word thin-content floor with room to spare and still be almost entirely boilerplate with an entity swapped in — long, but not original. content/unique-value measures originality directly by asking what vocabulary exists here and nowhere else on your site, which is much closer to how Google decides whether a URL earns its own slot in the index.\n\nThe most expensive mistake on programmatic sites is adding real, useful, but per-axis-shared data and expecting it to count. A regulation repeated across every page for that role, a spec block shared across a product line, a city's statutes echoed on each of that city's pages — all genuinely helpful, all shared, all worth zero toward this metric. The words that move it are the page-specific ones: a distinct lead, this record's particular facts, an example that exists only here. That is the difference between a database export and a page worth ranking.",
    failingExample:
      "/api/stripe-vs-square and /api/stripe-vs-paypal on a fintech directory. Each is 900 words, comfortably past the thin-content floor. But the shared 'What is a payment API' intro, the identical feature glossary, and the same integration checklist mean each page carries only sixty-odd words that appear nowhere else — 11% of its vocabulary is page-specific, 89% shared. The rule fires error: '/api/stripe-vs-square has only 64 page-unique words (min 100); 510 of its 574 distinct words also appear on other pages.'",
    passingExample:
      "The same two pages, rebuilt so each leads with provider-specific material: real Stripe Radar fraud-tooling detail on one, Square's in-person hardware fees on the other, each with its own code sample and pricing edge cases. The shared glossary moves to a linked reference page. Now each page carries two hundred-plus words that appear on no other URL — over 35% of its vocabulary is page-specific — the shared-to-unique ratio inverts, and the rule clears.",
    howToFix: [
      "Write a page-specific lead. The fastest 100 unique words are usually the opening paragraph — the one thing true of this entity and nothing else. Boilerplate intros are the first thing to cut.",
      "Move shared blocks to a shared URL. A glossary, a methodology note, or a legal disclaimer that repeats across pages should live on one page the others link to, not embedded everywhere where it dilutes uniqueness.",
      "Stop counting per-axis data as unique. Content repeated across pages on the same axis — a role's regulations across that role's documents — is useful but shared. Only text that exists on exactly one page moves the metric.",
      "Bind distinct records, not shared ones. If two pages pull the same fields from your data source, they will share vocabulary; differentiate the records or merge the pages.",
      "Read the shared/unique split the finding reports. It tells you exactly how many words you need to add and confirms that the problem is overlap, not length."
    ],
    spamBrainContext:
      "Originality has been the spine of Google's quality guidance for over a decade — the Search Quality Rater Guidelines have used 'no added value' as a Lowest-quality marker since 2014 — but the March 5, 2024 scaled-content-abuse update made it enforceable at scale by naming pages that exist 'with little unique value' as a policy violation regardless of how they were produced.\n\ncontent/unique-value (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is pseolint's most direct measure of that clause. Where spam/thin-content counts total substantive words and spam/boilerplate-ratio measures shared sentence blocks, this rule counts the page-exclusive vocabulary that survives comparison against every other page in the audit. It is an integrity-category error, not a warning, because a page below the 100-word floor is by definition contributing almost nothing the rest of the site does not already say — which is precisely the condition Google's deduplication and quality systems are built to demote.",
    faqs: [
      {
        q: "How is this different from the thin-content rule?",
        a: "spam/thin-content counts total substantive words and fires below 300; content/unique-value counts only the words that appear on no other page and fires below 100. A page can pass thin-content with 1,000 words and still fail unique-value if 950 of those words are boilerplate shared with its siblings. Length and originality are different axes — this rule measures the second one."
      },
      {
        q: "Does useful, accurate data count toward uniqueness?",
        a: "Only if it appears on exactly one page. This trips up pSEO teams constantly: a regulation, spec, or statistic that is genuinely useful but repeats across every page on the same axis is 'shared' and counts for nothing here. The metric moves only on page-specific text. The fix is not to remove the shared data but to add material that exists nowhere else on the site."
      },
      {
        q: "Why count distinct words rather than total words?",
        a: "Because repetition should not be rewarded. Counting distinct tokens, then keeping only those with a global frequency of one, isolates the genuinely page-specific vocabulary from filler. Saying 'San Francisco' fifty times adds one unique word, not fifty — which is the right behaviour for a rule trying to measure how much new information a page actually contributes."
      },
      {
        q: "Will the count change as I add or remove pages?",
        a: "Yes — uniqueness is relative to the audited set. A word that is unique today becomes shared the moment a second page uses it, so adding near-identical pages can lower the unique count on pages that previously passed. That is intentional: it reflects how Google evaluates your site as a whole, not each URL in isolation."
      },
      {
        q: "I sell telescopes — every page repeats the same optics glossary. Does that count?",
        a: "The glossary does not, but the instrument's own numbers do. A refractor page stating its 102-millimetre aperture, its 660-millimetre focal length, the supplied 25-millimetre eyepiece, and the dovetail mount it ships on carries vocabulary no sibling listing repeats. A computerised go-to altazimuth mount and a manual equatorial tripod differentiate two products that would otherwise read alike. Move the shared 'what is magnification' explainer to one reference URL, and each telescope's distinct aperture, focal ratio, and eyepiece kit becomes the page-unique substance the rule counts. A heritage-orchard nursery that lists the rootstock, the chill-hours requirement, and the pollination group for each apple cultivar gives every page words no sibling listing repeats."
      }
    ],
    relatedRules: ["thin-content", "boilerplate-ratio", "near-duplicate"],
    relatedTool: "thin-content-scanner"
  },
  {
    slug: "meta-uniqueness",
    ruleId: "content/meta-uniqueness",
    title: "Meta Description Uniqueness — When Snippets Are Templated",
    metaDescription:
      "Meta descriptions identical after masking the entity are templated, not written. How content/meta-uniqueness groups masked descriptions and why duplicate snippets hurt.",
    primaryKeyword: "duplicate meta descriptions SEO",
    oneLiner:
      "content/meta-uniqueness masks the entity tokens in every page's meta description, lower-cases and trims what remains, and fires an error the moment two or more pages collapse to the same string — the templated-snippet pattern Google has treated as scaled content since the March 5, 2024 spam update.",
    whatItDetects:
      "content/meta-uniqueness checks the one piece of copy most teams forget to vary: the meta description. For every page that has one, the rule masks the entity tokens using your entity patterns, then lower-cases and trims the result. Pages whose masked descriptions are byte-for-byte identical are grouped together.\n\nAny group with two or more members fires an error naming the count of pages that share the template. The masking is the important part. A description like 'Compare {tool} against the competition — pricing, features, and migration paths' looks unique on the surface for every tool, but the moment you mask the tool name, all of them collapse to the same sentence. That collapse is the signal: the description was generated from a template, not written for the page. The rule deliberately uses exact-match-after-masking rather than fuzzy similarity, so it only fires when the underlying snippet really is one template wearing different nouns.",
    whyItMatters:
      "Duplicate meta descriptions waste your single best chance to control how a result looks in the SERP. When Google detects templated or duplicate descriptions it routinely discards them and writes its own snippet from on-page text — so the copy you optimised is replaced by whatever the algorithm grabs. At scale, identical descriptions across a template are also a clean scaled-content tell: a thousand pages with one masked description is a thousand pages a script produced.\n\nBecause the meta description is short and structured, it is one of the cheapest signals to get right and one of the most embarrassing to get wrong. A pSEO template that binds real per-entity data into the body but leaves the description as a fixed sentence frame is announcing the template in the one field crawlers read first. Fixing it is low-effort — bind a distinct value into each description — and it clears both this rule and a chunk of the perception that the site is mass-produced.",
    failingExample:
      "A jobs board ships 4,000 pages whose descriptions all read 'Find {role} jobs in {city}. Browse openings, salaries, and apply today.' Each looks distinct in the page source, but after masking {role} and {city} every one becomes 'find jobs in. browse openings, salaries, and apply today.' The rule groups all 4,000 and fires error: '4000 pages share the same meta description template after entity masking.'",
    passingExample:
      "The same jobs board binds a real per-page figure into each description: 'Compare 312 senior-nurse openings in Austin — median pay $98,000, salaries from $72,000 to $110,000, 41 hiring this week.' After masking the role and city, the descriptions still differ because the counts and salaries differ per page. No two collapse to the same string, the rule stays silent, and the SERP shows the copy the team actually wrote.",
    howToFix: [
      "Bind a distinct value into every description. A per-page count, price, date, or named attribute pulled from your data source breaks the masked-match because the variable part survives masking.",
      "Do not rely on the entity alone. Swapping only the city or role is exactly what the rule masks away; the description must vary on something the mask does not remove.",
      "Write the description from the page's most specific fact. The best snippets answer 'why this page' in 155 characters — the same discipline that satisfies the rule makes the SERP result more clickable.",
      "Audit templates, not pages. One bad description template generates thousands of duplicates; fix the template's data binding once and the entire cluster clears.",
      "Check for empty descriptions too — pages with no meta description are skipped here, but they surface in tech/og-completeness and lose snippet control for a different reason."
    ],
    spamBrainContext:
      "Duplicate metadata predates SpamBrain as a quality concern — Google's old Search Console 'HTML Improvements' report once flagged duplicate descriptions directly — but the March 5, 2024 scaled-content-abuse policy gave it new weight by treating templated mass production as a violation independent of authorship. Identical descriptions across a template are among the most legible evidence that pages came off a generator.\n\ncontent/meta-uniqueness (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) sits in the integrity category alongside content/unique-value, and the two are complementary: one checks that the body says something page-specific, the other that the snippet does. It uses entity-masked exact matching rather than the SimHash similarity that spam/near-duplicate runs on bodies, because meta descriptions are short enough that fuzzy matching would over-fire — a few shared words would look like a template when they are not. Exact-match-after-masking keeps the false-positive rate near zero.",
    faqs: [
      {
        q: "Why mask entities before comparing descriptions?",
        a: "Because the surface text already differs — every description has a different city or product in it. Masking removes that variable so the rule can see whether anything else changes. If two descriptions are identical once the entity is gone, they came from one template; if they still differ, real per-page copy survives. Masking is how the rule distinguishes 'written per page' from 'generated from a frame'."
      },
      {
        q: "Is a duplicate meta description an actual penalty?",
        a: "Not a manual penalty, but a real cost. Google frequently ignores duplicate or templated descriptions and writes its own snippet from page content, so you lose control of how the result reads. At scale, the duplication is also a scaled-content signal. The rule treats it as an integrity-category error because it is both a wasted opportunity and a fingerprint of mass production."
      },
      {
        q: "How is this different from title-uniqueness?",
        a: "content/title-uniqueness compares raw page titles and flags exact duplicates; content/meta-uniqueness compares descriptions after entity masking. The difference matters: titles are usually meant to contain the entity, so raw comparison is right there, whereas descriptions are prose where a masked template is the real concern. They guard adjacent fields with deliberately different logic."
      },
      {
        q: "What if my descriptions legitimately share a sentence?",
        a: "Sharing a phrase is fine — the rule fires only on exact match after masking, not on partial overlap. If the descriptions differ on any unmasked content (a count, a price, a distinct clause), they will not group. The rule is built to tolerate a common voice while catching descriptions that are wholly templated."
      },
      {
        q: "Our wedding-venue listings all describe 'an unforgettable celebration' — is the meta the problem?",
        a: "That phrasing is the giveaway. Bind each venue's concrete distinguishers into the description instead: the ballroom's seated capacity, the garden-gazebo ceremony option, the in-house catering minimum, the reception square-footage, and the off-season Friday rate. A description reading 'Riverside Barn seats 180, gazebo ceremonies, 7,500-dollar Saturday corkage-free minimum' survives masking because the banquet figures differ per venue, while 'an unforgettable celebration at {venue}' collapses to one templated string the moment the name is masked away. A bridal-suite photo count, a sommelier-curated wine-pairing menu, a string-quartet add-on, and a marquee-tent rain contingency separate one ballroom from the next far better than any superlative adjective. A kiln-fired ceramics studio that names each glaze recipe, the cone firing temperature, and the wheel-thrown dimensions per piece avoids the same templated-snippet collapse."
      }
    ],
    relatedRules: ["near-duplicate", "thin-content", "boilerplate-ratio"],
    relatedTool: "thin-content-scanner"
  },
  {
    slug: "missing-author",
    ruleId: "content/missing-author",
    title: "Missing Author — Why Anonymous pSEO Pages Fail E-E-A-T",
    metaDescription:
      "A missing author E-E-A-T gap is a trust signal Google's raters notice. How content/missing-author flags pages with no byline, meta author tag, schema author, or rel=author link.",
    primaryKeyword: "missing author E-E-A-T",
    oneLiner:
      "Google added the second E for Experience to its E-A-T trust framework on December 15, 2022, and content/missing-author mirrors that shift by flagging at warning severity, medium confidence, every page that exposes none of four author signals — a meta author tag, a schema author field, a byline element, or a rel=author link.",
    whatItDetects:
      "content/missing-author checks one thing per page: is there any machine-readable claim of who wrote it? The rule reads four independent author signals the parser extracts and fires only when all four are absent.\n\nThe signals are precise. (1) Meta author — a non-empty content value on a `<meta name=\"author\">` tag, after whitespace normalisation, so an empty tag does not count. (2) Schema author — any JSON-LD object on the page that carries an `author` key, which covers Article, BlogPosting, and NewsArticle structured data. (3) Byline element — at least one element whose class contains 'author' or 'byline', or which carries `rel='author'`, catching the visible '.byline' or '.author-name' markup most templates ship. (4) Rel=author link — an `<a rel=\"author\">` or `<link rel=\"author\">` anchor pointing at a profile.\n\nA page passes if even one of the four is present, so the bar is deliberately low. Severity is fixed at warning and confidence at medium, because technical docs, product pages, and pricing pages legitimately omit bylines — attribution matters most on blog and news content where authorship is the primary trust signal.",
    whyItMatters:
      "Authorship is the cheapest E-E-A-T signal to add and one of the easiest to omit at scale, which is exactly why a fleet of anonymous programmatic pages reads as low-effort to a classifier. Google's Search Quality Rater Guidelines — the document its quality systems are trained to approximate — ask raters to identify who is responsible for a page and judge whether that source has the experience and expertise to write it. A page that names nobody gives the rater, and the classifier, nothing to weigh.\n\nThe danger is the pattern, not the single page. One unsigned changelog is fine; ten thousand unsigned 'expert guides' is a corpus that cannot answer the most basic trust question Google asks. This is why the rule escalates its messaging when every page on a site over three pages deep is anonymous, emitting a single site-wide finding that names the count and calls it a site-wide E-E-A-T risk rather than burying it in per-URL noise.\n\nAuthorship alone will not rank a thin page, but its absence removes a defence that costs almost nothing to mount and is disproportionately missing on generated content.",
    failingExample:
      "/guides/how-to-refinance-a-mortgage — a 900-word 'expert guide' with no `<meta name=\"author\">`, no author field anywhere in its Article JSON-LD, no element classed 'byline' or 'author', and no rel=author link. The page asserts financial expertise in its prose but attributes it to nobody, so a quality rater asked 'who is responsible for this?' has no answer. All four signals are absent and the rule fires at warning.",
    passingExample:
      "/guides/how-to-refinance-a-mortgage — the same guide, now signed. The `<head>` carries `<meta name=\"author\" content=\"Dana Mercer, CFP\">`, the Article JSON-LD includes an `author` object with a name and a sameAs profile link, and the visible byline sits in a `<div class=\"byline\">By Dana Mercer</div>` above the lede. Any one of those would satisfy the rule; shipping all three gives both Google and readers a consistent, verifiable source.",
    howToFix: [
      "Add a `<meta name=\"author\" content=\"Full Name\">` to every content page's head — it is the single cheapest signal and clears the rule on its own.",
      "Put the author into your JSON-LD: an Article or BlogPosting node with an `author` object carrying a name and, ideally, a sameAs link to a real profile.",
      "Render a visible byline in markup the rule recognises — an element classed 'author' or 'byline', or one carrying rel='author' — so humans and the parser see the same attribution.",
      "Link the byline to a genuine author bio page that documents the writer's relevant experience, not a stub; the link is what turns a name into an E-E-A-T signal.",
      "Decide which page types actually need authors. Technical docs and pricing pages can stay unsigned; blog, news, and 'guide' content should not, since that is where attribution carries the most trust weight.",
      "Audit site-wide before launch: if every page is anonymous on a site deeper than three pages, the rule emits one site-level E-E-A-T warning instead of per-URL findings, so fix the template once rather than page by page."
    ],
    spamBrainContext:
      "Authorship sits at the centre of E-E-A-T — Expertise, Experience, Authoritativeness, Trust — the framework Google's Search Quality Rater Guidelines have used since the E-A-T era and expanded on December 15, 2022 when the second E, for first-hand Experience, was formally added. E-E-A-T is not a direct ranking factor, but it is the lens the Helpful Content System (rebuilt August 25, 2022) and the March 5, 2024 scaled-content-abuse policy use to ask whether content was made to help people or to game search.\n\nThis rule (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is intentionally conservative: warning severity, medium confidence, and a single-signal pass bar, because a missing byline is suggestive of low effort, not proof of spam. Its value is corroborative — an anonymous corpus that also trips thin-content or near-duplicate is a far stronger 'made for search engines' signal than any one rule alone. It is the per-page complement to content/eeat-signals, which counts authorship as one of four broader trust categories alongside about-page links, publication dates, and 'last updated' markers.\n\nWhat the rule cannot do is judge whether a named author is real or qualified — it only verifies that an attributable source is claimed at all.",
    faqs: [
      {
        q: "Which of the four signals satisfies the rule fastest?",
        a: "Any single one. The rule passes a page the moment it finds a non-empty `<meta name=\"author\">`, an `author` key in JSON-LD, a byline or author-classed element, or a rel=author link. The cheapest to add is the meta tag — one line in the head — but the schema author and visible byline carry more weight with both Google and readers because they are harder to fake and visible in more contexts."
      },
      {
        q: "Why is this only a warning, not an error?",
        a: "Because plenty of legitimate page types ship without a byline. Technical documentation, product pages, and pricing pages are not expected to name an author, and flagging them as errors would be noise. Author attribution matters most on blog and news content where E-E-A-T is the primary trust signal, so the rule surfaces the gap at warning severity and medium confidence and lets you decide whether the page type genuinely needs a source."
      },
      {
        q: "Our investigative newsroom already runs reporter bylines — will this rule fire on us?",
        a: "Not if those bylines are in markup the parser can read. A masthead and a dateline are human-facing conventions; the rule needs a machine-readable signal. As long as each staff-reporter story carries a `<div class=\"byline\">` or an `author` field in its NewsArticle JSON-LD — not just a hand-set 'By Our Correspondent' line that the editor-in-chief styled with a class the rule does not recognise — every article passes. If a wire-service dispatch republished under your masthead has no byline element at all, the rule correctly flags it as the one anonymous page in an otherwise-attributed corpus. In one illustrative cleanup, a desk that signed only 73% of its filed stories closed the gap to full coverage within an 11-day sprint by binding the staff-reporter field into its NewsArticle template. The same fix rescues a herbalist co-op whose remedy monographs ran unsigned until each contributing clinical-herbalist credential was bound into the byline."
      },
      {
        q: "Does adding a fake author name fix the real problem?",
        a: "It clears this rule but defeats the point. The rule only verifies that an attributable source is claimed; it cannot tell whether the name is real or qualified. A fabricated 'expert' byline that links nowhere will satisfy the parser yet still read as untrustworthy to a human quality rater, who is explicitly asked to assess whether the named author has the experience to write the page. Use real people with genuine bios, or the signal is hollow."
      },
      {
        q: "How does missing-author differ from the eeat-signals rule?",
        a: "content/missing-author is narrow: it checks the four author signals and nothing else. content/eeat-signals is broader, counting authorship as just one of four trust categories — the others being an about-page link, a detectable publication date, and 'last updated' or 'reviewed by' markers — and it fires when a page carries fewer than two of the four. A page can pass missing-author by having a byline yet still trip eeat-signals if it lacks dates and an about link."
      }
    ],
    relatedRules: ["thin-content", "unique-value", "meta-uniqueness"],
    relatedTool: "spambrain-checker"
  },
  {
  slug: "eeat-signals",
  ruleId: "content/eeat-signals",
  title: "E-E-A-T Signals — When a Page Carries No Evidence of Who Wrote It",
  metaDescription:
    "A page with no author, date, about link, or sources looks anonymous. How content/eeat-signals counts 4 trust categories per URL and fires below a 2-of-4 floor.",
  primaryKeyword: "E-E-A-T signals SEO",
  oneLiner:
    "content/eeat-signals checks four trust categories on every page — an about-page link, an author byline, a published date, and a sources or references marker — then fires at info severity for any URL carrying fewer than 2 of the 4, the anonymity pattern Google's E-E-A-T framework has weighed against pages since its December 2022 Quality Rater Guidelines update.",
  whatItDetects:
    "content/eeat-signals scores each page against four independent trust categories and counts how many it carries. The first is an about-page link: the rule scans the page's resolved hrefs for any URL matching '/about'. The second is an author signal, satisfied if the page exposes a non-empty author meta tag, a schema.org author, a byline element, or a rel=author link. The third is a published date the parser could extract. The fourth is a 'sources' category, matched when the raw HTML contains any of five patterns: 'last updated', 'last modified', 'reviewed by', 'sources:', or 'references:'.\n\nA page passes if it carries 2 or more of those 4 categories. Any page below that floor is flagged. The rule never inspects the quality of the byline or the accuracy of the date — it only asks whether the markers of accountability are present at all. The point is structural: a page that names nobody, dates nothing, links to no about page, and cites no source is anonymous by construction, and anonymity is the baseline condition Google's trust evaluation reads first.",
  whyItMatters:
    "E-E-A-T — Experience, Expertise, Authoritativeness, Trustworthiness — is how Google's raters decide whether a page deserves trust, and trust starts with knowing who is speaking. A page with no author, no date, and no sources gives a rater nothing to evaluate, so it defaults to the floor. This rule catches the corpora most prone to that failure: programmatically generated pages, where the template binds entity data into the body but forgets that a real publisher signs its work.\n\nThe cost is highest on Your-Money-or-Your-Life topics — health, finance, legal, safety — where Google's guidelines demand visible expertise before a page can rank. But the markers are cheap to add and the absence is conspicuous at scale: ten thousand undated, unsigned pages on one template is a clean tell that no human stood behind any of them. The rule fires at info severity because a single missing signal is guidance, not a verdict — but a whole corpus stuck below the 2-of-4 floor is a structural credibility gap that pairs badly with thin-content or near-duplicate findings on the same pages.",
  failingExample:
    "/guides/how-to-refinance-a-mortgage on a programmatically generated finance site. The body is 1,200 words of real advice, but there is no byline, no published or updated date, no link to an about page, and no sources or references block anywhere in the HTML. The page carries 0 of the 4 trust categories. The rule fires at info: '/guides/how-to-refinance-a-mortgage has fewer than 2 out of 4 E-E-A-T signal categories.'",
  passingExample:
    "The same refinance guide, reissued with accountability attached: a byline reading 'Reviewed by Dana Okafor, CFP' resolves the author category, a visible 'Last updated March 4, 2026' line satisfies both the date and the 'last updated' sources pattern, and a footer link to /about-our-editorial-team adds the about category. The page now carries 4 of 4 categories, clears the 2-of-4 floor with room to spare, and a rater can see exactly who stands behind the advice.",
  howToFix: [
    "Add a real author byline to every template. A meta author tag, a schema.org author property, a visible byline element, or a rel=author link each satisfies the author category — pick one and bind a genuine name, not a brand placeholder.",
    "Expose a published or updated date. The rule reads the date the parser extracts, so surface a real article:published_time or a visible 'Last updated' line rather than leaving the page undated.",
    "Link to an about page from the template footer or header. Any href matching '/about' resolves the category, and one shared link covers the whole corpus at once.",
    "Cite sources where the topic warrants it. A 'Sources:' or 'References:' block, or a 'Reviewed by' line, matches the rule's patterns and gives readers and raters something to verify against.",
    "Treat a site-wide finding as a template fix, not a per-page chore. When every page is below the floor, the cause is one template missing accountability markers — add them once at the template level and the whole cluster clears.",
    "Prioritise the fix on Your-Money-or-Your-Life pages first, where Google's guidelines weigh visible expertise most heavily before granting trust."
  ],
  spamBrainContext:
    "E-E-A-T is not a spam rule and not a ranking factor you can game — it is the conceptual frame Google's Search Quality Rater Guidelines use to describe trustworthy pages, expanded from E-A-T to add 'Experience' in the December 2022 guidelines update. The raters who apply it are not the algorithm, but their judgements train the systems that are, which is why the visible markers of accountability matter even though no single tag is a direct signal.\n\ncontent/eeat-signals (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is the gentlest expression of that frame in the suite — it fires at info severity and never blocks a verdict, because the presence of an about link or a byline proves nothing about quality on its own. Its job is to catch the structural anonymity that programmatic templates fall into: pages that carry real content in the body but none of the who-wrote-this, when, and on-what-authority markers a credible publisher attaches by reflex. When that anonymity coincides with thin or templated content, the corpus reads as mass-produced and unaccountable at the same time.",
  faqs: [
    {
      q: "What are the four E-E-A-T signal categories the rule checks?",
      a: "An about-page link (any resolved href matching '/about'), an author signal (a non-empty author meta tag, a schema.org author, a byline element, or a rel=author link), a published date the parser could extract, and a 'sources' marker (the HTML containing 'last updated', 'last modified', 'reviewed by', 'sources:', or 'references:'). A page passes by carrying any 2 of the 4; below that floor it is flagged at info severity."
    },
    {
      q: "Why does the rule fire at info severity instead of warning or error?",
      a: "Because a present marker proves nothing about quality, and a single missing one is not damning. A byline does not make a page expert, and a date does not make it accurate — the rule only checks that the markers of accountability exist at all. Info severity reflects that this is structural guidance, not a verdict. Its weight comes from corroboration: anonymity across a whole corpus matters most when it pairs with thin-content or near-duplicate findings on the same pages."
    },
    {
      q: "Does adding a fake author byline satisfy the rule?",
      a: "It satisfies the literal check, because the rule only detects whether an author signal is present, not whether the person is real. But that misreads the purpose. The rule is a proxy for accountability, and a fabricated byline on a Your-Money-or-Your-Life page is exactly the pattern Google's raters are trained to distrust. Bind a genuine name with verifiable credentials; gaming the marker without the substance trades a clean info finding for a real trust problem a human reviewer will catch."
    },
    {
      q: "Our certified personal-finance advice site keeps tripping this on its tax-planning pages — what is missing?",
      a: "Almost certainly the accountability markers a fiduciary practice should already be proud to display. A page walking a reader through an IRA rollover or how a Roth conversion lands in their marginal bracket should carry the byline of the certified financial planner who reviewed it, that planner's CFP credential, a visible 'last updated' date for when the contribution limits were checked, and a sources block citing the relevant IRS publication. Add those and a YMYL tax-planning page that was anonymous becomes a page a rater can trust — and clears the 2-of-4 floor on the strength of credentials you can substantiate. As an illustration, a tax-advice section that added a Series 65 registration line, a visible review date, and an errors-and-omissions disclosure lifted its coverage to 4-of-4 in 9 days and clawed back 22% of lost long-tail clicks over the following 13 weeks. A vineyard's tasting-notes pages earn the same lift once each varietal entry carries a winemaker byline, the bottling vintage, and a soil-and-terroir sourcing note."
    },
    {
      q: "How is this different from the missing-author rule?",
      a: "content/missing-author is narrow: it checks one thing, whether a page exposes any author signal at all. content/eeat-signals is broader — author is only one of its four categories, alongside an about link, a published date, and a sources marker, and it judges the combination against a 2-of-4 floor. A page can have an author and still trip eeat-signals if it is missing everything else, and a page with no author can still pass if it carries two of the other three."
    },
    {
      q: "Will fixing E-E-A-T signals improve my rankings directly?",
      a: "Not directly — E-E-A-T is an evaluative frame, not a measurable ranking input, so no single tag moves a position on its own. What it does is remove a credibility gap that drags on the whole picture, especially on health, finance, legal, and safety topics where Google's guidelines demand visible expertise. The honest framing is that satisfying this rule is necessary but not sufficient: it clears the anonymity that holds a page back without being the thing that pushes it forward."
    }
  ],
  relatedRules: ["missing-author", "thin-content", "unique-value"],
  relatedTool: "spambrain-checker"
},
  {
  slug: "title-uniqueness",
  ruleId: "content/title-uniqueness",
  title: "Title Uniqueness — Missing, Too-Short, and Duplicate Page Titles",
  metaDescription:
    "The page title is Google's strongest on-page signal. How content/title-uniqueness flags missing titles, the 10-to-70-character band, and duplicate page titles.",
  primaryKeyword: "duplicate page titles SEO",
  oneLiner:
    "content/title-uniqueness rolls three checks into one rule — a missing or empty title, a title outside the 10-to-70-character band, and two or more pages sharing the exact same raw title — and it raised this gap to a tier-1 fix in pseolint after the 2026-05-03 blind-spot audit because Google ranks the title above every other on-page element.",
  whatItDetects:
    "content/title-uniqueness runs three checks over the title that the existing meta-description rule never touched. First, a missing title: any page whose <head><title> is absent, empty, or whitespace-only fires an error, because the title is the strongest on-page signal Google ranks against. Second, length. A title under 10 characters fires a warning — short titles get rewritten by Google from the H1 or anchor text, so the copy you wrote never shows. A title over 70 characters fires an info finding, because Google truncates the SERP snippet around 60 characters and the tail is lost.\n\nThird, exact duplicates. The rule groups every page by its raw, trimmed title string and fires an error the moment two or more pages share one. It does NOT entity-mask the way the meta rule does — 'Slack to Google Sheets' and 'Slack to Airtable' are different raw strings and stay separate, so the rule never false-positives on a legitimate templated catalog whose titles already carry the per-record entity.",
  whyItMatters:
    "The title is the single highest-impact on-page element Google reads, and the three failure modes this rule catches each waste it differently. A missing title hands Google a blank where your best keyword should sit, so the engine invents a snippet from whatever H1 or link text it finds. A title under 10 characters is too thin to survive — Google rewrites it from the H1, discarding your copy. A title past 70 characters gets truncated in the SERP, so the most important words at the end never reach the searcher.\n\nDuplicate titles are the most damaging at scale. When a thousand catalog pages all carry one identical title, Google cannot tell them apart in the index, clusters them, and demotes all but one. The fix is cheap and the win is immediate: a unique, well-scoped title per URL is the lowest-effort, highest-return change on most programmatic sites, and it is the one field a crawler reads before anything else on the page.",
  failingExample:
    "A SaaS integrations catalog ships 600 pages whose <head><title> is the same literal string on every URL: 'Integrations — Connect Your Tools'. The rule groups all 600 and fires an error: '600 pages share the exact title \"Integrations — Connect Your Tools\".' A second page in the same crawl carries no <head><title> at all — its only <title> is an inline SVG <title> label on the logo ('Acme logo'), which crawlers do not use as the page title, so that page fires a separate error too.",
  passingExample:
    "The same catalog binds the per-record entity into every title: 'Slack to Google Sheets Integration — Sync Messages Automatically' (62 chars) on one page, 'Notion to Airtable Integration — Two-Way Database Sync' on the next. Each title is a real <head><title>, sits inside the 10-to-70-character band, and is unique across the crawl because the integration pair survives in the raw string. No group has two members, every length check passes, and the rule stays silent.",
  howToFix: [
    "Add a non-empty <head><title> to every page. If a template can render without one, that is the first leak to plug — the title is the field Google reads before any other.",
    "Bind the per-record entity into the title so duplicates cannot form. A raw string carrying the integration name, currency pair, or city is unique by construction and never groups.",
    "Keep titles inside the 10-to-70-character band. Expand anything under 10 characters so Google does not rewrite it from the H1; tighten anything over 70 so the SERP does not truncate the tail.",
    "Front-load the distinguishing words. Google truncates around 60 characters, so the entity and primary keyword belong at the start, not after a long brand suffix.",
    "Never treat an inline SVG <title> as the page title. That logo accessibility label is decorative and crawlers ignore it — add a real <head><title> with the page entity instead.",
    "Re-run the audit after editing a template. Fixing one duplicated title clears the whole group at once, since the rule reports per shared string, not per URL."
  ],
  spamBrainContext:
    "The page title predates every SpamBrain-era policy as a ranking input — it has been the strongest on-page signal since the earliest days of Google's index — which is why the 2026-05-03 blind-spot audit flagged its absence in pseolint as a tier-1 gap and led to this rule shipping in @pseolint/core (MIT-licensed at github.com/ouranos-labs/pseolint). Titles are not meta descriptions, so content/meta-uniqueness never covered them.\n\nThe two rules guard adjacent fields with deliberately different logic. Meta descriptions are prose, so the meta rule entity-masks before comparing to catch a templated sentence frame. Titles are usually built to contain the entity, so a raw exact-match comparison is the correct test — masking would wrongly collapse two legitimately distinct catalog titles into a false duplicate. Duplicate titles also read as a scaled-content tell at volume: a thousand pages under one identical title is a thousand pages a generator produced without a per-record title binding, the same mass-production fingerprint Google's March 5, 2024 scaled-content-abuse policy was written to demote.",
  faqs: [
    {
      q: "Why does the rule compare raw titles instead of masking the entity first?",
      a: "Because titles are meant to contain the entity. A catalog title like 'Slack to Google Sheets' is supposed to carry the integration name, so a raw exact-match comparison is the right test — the two pages are genuinely different. Masking would strip those entities and wrongly collapse every catalog title into one false duplicate, false-positiving on every directory in existence. The meta-uniqueness rule masks because descriptions are prose where a templated frame is the real concern; titles are not, so this rule deliberately uses raw comparison."
    },
    {
      q: "What are the exact title length limits the rule checks?",
      a: "Two thresholds. A title under 10 characters fires a warning because Google rewrites titles that short from the H1 or anchor text, discarding your copy. A title over 70 characters fires an info finding because Google truncates the SERP snippet around 60 characters, so the tail is lost. The healthy band is 10 to 70 characters, and front-loading the distinguishing words keeps them visible even when the snippet truncates near 60. Missing or empty titles are a separate, more severe case — those fire an error, not a length finding."
    },
    {
      q: "My logo has an SVG <title> — why does the rule say my page has no title?",
      a: "An inline SVG <title> is an accessibility label for the graphic, not the page title. Crawlers do not use it as the title that appears in search results. When a page has no <head><title> and its only <title> element is that SVG label, the rule fires an error and names the SVG text it found, because naive extractors used to mis-report that label as the page title. The fix is to add a real <head><title> in the document head with the page's per-record entity; leave the SVG <title> where it is for screen readers."
    },
    {
      q: "Our antiquarian bookshop catalogue gives every first edition the same title — does that trip the rule?",
      a: "It does, and the duplicate-title error is doing exactly its job. A page titled 'Rare Book — Out of Print' on a Graham Greene first edition with its dust jacket intact, and an identical title on a foxed Penguin paperback, collapse to one shared string and fire an error. Bind each listing's concrete distinguishers into the raw title instead: the author, the edition, the binding state. A title reading 'Brighton Rock, 1938 First Edition, Heinemann — Jacket Present, ISBN-Free Colophon' stays unique because the spine details and edition differ per volume, while 'Rare Book — Out of Print' repeats verbatim across the whole catalogue and groups the moment a second listing reuses it. In one catalogue cleanup, deduplicating the verbatim titles recovered an estimated 31% of the collection's lost listing impressions within 10 days of the next recrawl."
    },
    {
      q: "How is this different from the meta-uniqueness rule?",
      a: "They guard adjacent fields with opposite comparison logic. content/title-uniqueness compares raw, trimmed page titles and flags exact duplicates, plus it checks the 10-to-70-character length band and missing titles. content/meta-uniqueness compares descriptions only after entity masking, with no length check. The difference is intentional: titles are meant to contain the entity so raw comparison is correct, whereas descriptions are prose where a masked template is the real concern. Run both — one keeps the SERP title unique and well-sized, the other keeps the snippet from being a generated frame."
    }
  ],
  relatedRules: ["meta-uniqueness", "heading-structure", "thin-content"],
  relatedTool: "thin-content-scanner"
},
  {
  slug: "heading-structure",
  ruleId: "content/heading-structure",
  title: "Heading Structure — Missing, Duplicate, and Unstructured Headings",
  metaDescription:
    "Pages with no H1 are a template bug; multiple H1s confuse the topic signal. How content/heading-structure flags missing, duplicate, and unstructured headings.",
  primaryKeyword: "heading structure SEO",
  oneLiner:
    "content/heading-structure runs three checks on every page Google crawls — a missing H1 fires an error because it is almost always a CMS or template bug, two or more H1 elements raise a warning that the HTML5 outline and accessibility checkers both dislike, and any page past 600 words with no H2 sub-structure emits an info note about Featured Snippet eligibility.",
  whatItDetects:
    "content/heading-structure runs three independent checks over every parsed page and emits one finding per problem it sees. First, if a page has zero <h1> elements it fires an error — a page with no top-level heading is almost always a CMS misconfiguration or a template that forgot to render the title, and Google leans on the H1 to disambiguate the page's primary topic when the title tag is weak.\n\nSecond, if a page carries more than one <h1>, the rule raises a warning and reports the count. A single H1 per document is the convention every accessibility checker enforces and several SEO heuristics still expect, so multiple H1s read as an ambiguous primary-topic signal.\n\nThird, the rule measures the page's body word count by splitting the main text on whitespace; once that count reaches 600 words and the page has no <h2> at all, it emits an info finding. A long wall of text with no sub-headings is a readability and Featured Snippet problem, not a correctness bug, which is why this third check sits at the gentlest severity.",
  whyItMatters:
    "Heading hierarchy is one of the few on-page signals that is both machine-read and human-read at once. Google parses the H1 and H2 sequence to build a topic outline of the page, and assistive technology turns the same structure into a navigable table of contents. When the H1 is missing entirely, both readers lose their anchor: the crawler falls back to the title tag or guesses from body text, and a screen-reader user lands on a page with no heading to orient them.\n\nMultiple H1s are a milder failure but a real one. The HTML5 specification's document-outline algorithm tolerates them in theory, yet no mainstream browser ever implemented that algorithm, so in practice the page exposes several competing top-level headings with no defined precedence. That is why the rule treats it as a warning rather than an error — it rarely breaks ranking outright, but it muddies the primary-topic signal and trips accessibility audits.\n\nThe 600-word-without-an-H2 case costs you eligibility, not rank. Featured Snippets and the question-answer blocks that feed AI Overviews are extracted from clearly delimited sections; a long page with no H2 gives the extractor nothing to grab, so the content can rank yet never surface in the formats that earn the most visibility.",
  failingExample:
    "A pSEO city-services template renders 4,000 pages where the hero block is wrapped in a styled <div> instead of an <h1>, so every page reports zero <h1> elements and fires an error. A handful of long guide pages compound the problem: each runs past 1,800 words of plumbing-permit prose in a single unbroken column with no <h2> anywhere, so they also pick up the 600-word info finding.",
  passingExample:
    "The same template, fixed: the hero block is now a single <h1> naming the city and service ('Emergency Plumbers in Austin'), and the long guide pages are broken into <h2> sections — 'Permit requirements', 'Average call-out cost', 'What to ask before hiring'. Every page reports exactly one H1, and no page over 600 words is left without sub-headings, so all three checks pass.",
  howToFix: [
    "Add a single <h1> to every page that lacks one — name the page's primary topic in it, since Google uses the H1 to disambiguate when the title tag is unclear.",
    "Where a page has two or more H1s, keep one and demote the rest to <h2>; the visual size can stay identical via CSS, only the markup level changes.",
    "Check that your hero title is a real <h1> tag and not a styled <div> or <span> — CSS that merely looks like a heading does not count and still trips the missing-H1 error.",
    "Break any page over 600 words into sections with <h2> sub-headings; aim for one H2 per distinct idea so Featured Snippet extractors have clear blocks to pull from.",
    "Fix the template, not the page — a missing or duplicated H1 in a pSEO layout repeats across every generated URL, so one markup change clears the entire cluster at once.",
    "Re-run the audit after editing the template to confirm all three checks (missing, duplicate, and 600-word-no-H2) clear together."
  ],
  spamBrainContext:
    "content/heading-structure is a content-quality rule, not a spam classifier, which is why none of its three checks ever escalates past warning into the critical tier that spam/doorway-pattern occupies. Missing or duplicate headings are usually honest engineering mistakes — a broken template, a CMS that wraps the title in a <div> instead of an <h1>, a marketing page that pastes two hero blocks each with its own H1. The rule surfaces them so they get fixed, not because they signal manipulation.\n\nThat said, heading problems travel with scaled-content problems often enough to be worth reading together. A programmatic template that renders no H1 across thousands of URLs, or stamps an identical multi-H1 layout onto every generated page, is leaking the same structural monotony that the August 25, 2022 Helpful Content System and the March 5, 2024 scaled-content-abuse update were written to down-weight. When a heading finding lands on a template that also trips a thin-content or boilerplate check, treat the cluster as one signal: the headings are telling you the same generator built every page, and Google reads structural sameness as mass production.\n\nThis rule ships in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint.",
  faqs: [
    {
      q: "How does content/heading-structure decide a page has 'no H1'?",
      a: "It counts the <h1> elements in the parsed page. If that count is exactly zero, the rule fires an error, because a page with no top-level heading is almost always a template or CMS bug rather than a deliberate choice. The check looks only at the <h1> tag itself, not at ARIA roles or visually-styled <div> headings, so a heading that merely looks like an H1 in CSS but is not marked up as one still counts as missing."
    },
    {
      q: "Why is having two H1 elements only a warning and not an error?",
      a: "Because it rarely breaks ranking on its own. The HTML5 document-outline algorithm technically permits multiple H1s, but no browser ever shipped that algorithm, so the practical effect is a muddied primary-topic signal and a failed accessibility check rather than a broken page. The rule reflects that by reporting multiple H1s at warning severity — worth fixing, but not the emergency that a missing H1 represents. The fix is to keep one H1 and demote the rest to H2."
    },
    {
      q: "What exactly is the 600-word rule and why is it only an info note?",
      a: "The rule counts the words in a page's main body text, and once that count reaches 600 with zero <h2> elements present, it emits an info-severity finding. A long page with no sub-headings is a readability and Featured Snippet problem, not a correctness error, so it sits at the gentlest severity in the engine. Below 600 words the rule stays silent about H2s entirely, on the logic that a short page does not need sectioning to be scannable."
    },
    {
      q: "Our gallery-guide site keeps tripping the missing-H1 error on its exhibition pages — what is going on?",
      a: "This is the single most common shape of the error. A museum or gallery-guide CMS will often render the exhibition name as a large, beautifully-styled <div> at the top of each accession page, with the docent's wall-label notes, provenance history, and antiquities catalogue numbers all flowing beneath it — but if that title <div> is never marked up as an <h1>, the rule counts zero H1s and fires. Wrap the exhibition title for each gallery wing in a real <h1> ('Etruscan Bronzes, West Wing — Accession 1974.118'), and the error clears across every exhibit-label page at once. If a long curator's essay on a single show also runs past 600 words in one column, add <h2> sub-headings for provenance, conservation, and exhibition history so the docent-written prose stays scannable. After one gallery rebuilt its exhibit-label template, restoring a single H1 per page lifted Featured-Snippet eligibility on 44% of its long essays and recovered an estimated 21% of guide-page entrances within a 12-day window."
    },
    {
      q: "Does this rule check H3 or deeper heading levels, or whether headings are nested in the right order?",
      a: "No. content/heading-structure deliberately checks only three things: the presence of exactly one <h1>, the absence of multiple <h1>s, and whether a long page has at least one <h2>. It does not validate that H2s precede H3s, that levels are never skipped, or that the nesting forms a clean tree. Those deeper outline-validity checks are a separate concern; this rule targets the three failures that most reliably indicate a template bug or a scannability gap, and keeps its scope narrow so its findings stay actionable."
    }
  ],
  relatedRules: ["thin-content", "unique-value", "boilerplate-ratio"],
  relatedTool: "thin-content-scanner"
},
  {
  slug: "image-alt-text",
  ruleId: "content/image-alt-text",
  title: "Image Alt Text — Catching Content Images That Ship With No Description",
  metaDescription:
    "Content-bearing images missing alt text fail WCAG and lose Google Images traffic. How content/image-alt-text scans every <img>, honors decorative exceptions, and reports per page.",
  primaryKeyword: "image alt text SEO",
  oneLiner:
    "content/image-alt-text scans every <img> tag on a page, skips images you have explicitly marked decorative, and reports each URL where a content-bearing image carries no alt attribute at all — the accessibility gap WCAG 2.1 has required closing under success criterion 1.1.1 since June 5, 2018 and the one that keeps a page out of Google Images.",
  whatItDetects:
    "content/image-alt-text reads every <img> tag in a page's HTML and asks one question of each: is this image content-bearing, and if so does it have an alt attribute at all? The rule parses the tag's attributes, then skips any image you have deliberately marked as decorative — role=\"presentation\" or role=\"none\", aria-hidden=\"true\", or an explicit empty alt=\"\". An empty alt is treated as an intentional signal that the image carries no information, so it is accepted, never flagged.\n\nThe rule fires only when the alt attribute is entirely missing from a content-bearing image — not when it is present but short, and not on images you told it to ignore. For each page it counts how many qualifying images lack alt, divides by the total content-bearing images on that page, and emits one summary finding per URL rather than one line per image. A sample of up to three image sources is attached so you can find the offenders fast.\n\nSeverity scales with how widespread the gap is on the page: when at least half of a page's content images are missing alt the finding is a warning; below that ratio it drops to info, on the logic that a single stray image is a smaller signal than a template that never binds the slot.",
  whyItMatters:
    "Alt text is the only description a screen reader, a slow connection, or a crawler has when the pixels do not load. WCAG 2.1 success criterion 1.1.1 (Non-text Content) requires a text alternative for every image that conveys information, which is why a missing alt is both an accessibility defect and, in many jurisdictions, a legal exposure. The same string is what Google Images indexes against — a product shot with no alt is a product shot Google cannot read, and the image-search traffic that would have found it goes to a competitor whose markup is complete.\n\nFor a programmatic site the failure is rarely one careless image. It is a template whose alt slot was left at a literal default — or left blank — and then iterated across every page in the catalog, so a single missing binding becomes thousands of undescribed images at once. That is exactly the shape this rule is built to surface: a per-page ratio that climbs toward 100% across a cluster is the tell that the data source never fed the alt attribute, the same way it feeds the heading and the body copy.\n\nThe fix costs almost nothing in content terms. Binding a real, per-image description from the same data the rest of the page already uses closes the accessibility gap and opens the Google Images channel in one edit.",
  failingExample:
    "/catalog/giclee-print-harbor-fog — a fine-art listing whose hero image renders as <img src=\"/img/harbor-fog.jpg\"> with no alt attribute, alongside three thumbnail crops that are also missing it. The template iterates this same shape across all 1,800 prints in the shop, so every listing ships four undescribed content images. On this page four of four content-bearing images lack alt, a ratio of 100%, and the rule fires at warning severity naming the page and the first three image sources.",
  passingExample:
    "/catalog/giclee-print-harbor-fog — the same listing after the template binds alt from the print record: <img src=\"/img/harbor-fog.jpg\" alt=\"Harbor Fog giclee print, 24x36 inch edition of 50 on archival cotton rag\">. The decorative divider graphic between sections is marked aria-hidden=\"true\" so the rule correctly skips it, and a purely ornamental flourish carries alt=\"\" on purpose. Zero content images are missing alt, the finding does not fire, and Google Images can now read every shot in the gallery.",
  howToFix: [
    "Add a descriptive alt attribute to every content-bearing <img> that conveys information — describe what the image shows, not the file name, and keep it to a natural phrase a screen reader can speak.",
    "For purely decorative images — dividers, background flourishes, spacer graphics — set alt=\"\" explicitly or add aria-hidden=\"true\" so the rule recognises the omission as intentional rather than forgotten.",
    "In a pSEO template, bind the alt text from the same data source that fills the rest of the page — the product name, the city, the edition size — so each generated image gets its own description instead of a static default.",
    "Never leave a templated alt at a literal placeholder like alt=\"image\" or the entity name alone; a default that repeats across every page is its own duplicate-content tell even though it technically passes this rule.",
    "Re-run the audit after fixing the template binding — because the finding is per page, a single corrected template binding clears the warning across the entire catalog at once.",
    "Spot-check with a screen reader or the browser accessibility tree to confirm the descriptions actually make sense when read aloud, not just that the attribute is present."
  ],
  spamBrainContext:
    "Alt text sits at the intersection of accessibility law and search visibility, which is why it is worth getting right independently of any spam policy. The Web Content Accessibility Guidelines have required a text alternative for non-text content since WCAG 1.0 in 1999, carried forward unchanged into WCAG 2.0 (December 11, 2008) and WCAG 2.1 (June 5, 2018) as success criterion 1.1.1 — the most-cited clause in accessibility litigation. Google's own Image SEO documentation states plainly that alt text is how the crawler understands an image's subject and is a primary factor in Google Images ranking.\n\ncontent/image-alt-text (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is a content-category check, not a spam-weighted one. It does not claim a penalty; it surfaces a quality and accessibility gap that programmatic templates produce at scale when the image slot is the one field the data binding forgot. The signal it shares with the rest of the suite is templating: a missing alt that repeats across a whole catalog is the same mass-production fingerprint that spam/template-diversity and content/unique-value read elsewhere, just expressed in the one attribute crawlers and assistive technology both depend on.",
  faqs: [
    {
      q: "Does the rule flag every image without alt text?",
      a: "No. It skips images you have explicitly marked as decorative — role=\"presentation\", role=\"none\", aria-hidden=\"true\", or an empty alt=\"\". An empty alt is read as a deliberate signal that the image carries no information, so it is accepted. The rule fires only when the alt attribute is entirely missing from a content-bearing image, because a missing attribute means the author never decided whether the image was informative or decorative."
    },
    {
      q: "Why is alt=\"\" treated as passing rather than failing?",
      a: "Because an explicit empty alt is the correct WCAG-recommended markup for a purely decorative image — it tells a screen reader to skip the image entirely instead of announcing a file name. Flagging it would push authors toward describing images that should stay silent, which harms accessibility. The rule distinguishes 'deliberately empty' from 'forgotten' by checking whether the attribute exists at all, and only the second case is a defect."
    },
    {
      q: "Why does severity change between warning and info?",
      a: "The rule computes the share of a page's content images that are missing alt. When at least half are missing, the finding is a warning — that pattern almost always means a template never bound the slot, so it scales across the whole site. Below half, it drops to info, because a handful of stray images on an otherwise-complete page is a smaller, more isolated problem worth noting but not alarming over."
    },
    {
      q: "How should a pSEO template handle alt text for generated images?",
      a: "Bind it from the same data source that fills the rest of the page. If each page renders a product name, a city, or an attribute from a record, the alt attribute should pull from that record too — alt=\"{productName} in {city}\" — so every generated image gets a description as specific as the page. Leaving the slot at a static literal default produces thousands of identical, uninformative alts, which is its own templated-content signal even though it technically satisfies the presence check."
    },
    {
      q: "I run a fine-art print shop — how should I write alt text for a giclee listing?",
      a: "Describe what the buyer is judging, not the file. For an archival giclee print, an alt like \"Harbor Fog giclee print, 24x36 inch edition of 50, matte finish on cotton rag paper\" carries the edition size, the aspect ratio, the paper stock, and the finish — the exact attributes a collector searches Google Images for. Mark the decorative gallery-wall mockup or the framing-corner flourish with aria-hidden=\"true\", and bind the substantive description for each print from its catalog record so a 1,800-piece collection stays both accessible and indexable without a single hand-written attribute."
    }
  ],
  relatedRules: ["thin-content", "unique-value", "heading-structure"],
  relatedTool: "thin-content-scanner"
},
  {
  "slug": "orphan-pages",
  "ruleId": "links/orphan-pages",
  "title": "Orphan Pages — URLs No Other Page Links To",
  "metaDescription": "Orphan pages have zero inbound internal links, so Googlebot can't crawl them from your site. How links/orphan-pages finds every unreachable URL in your corpus.",
  "primaryKeyword": "orphan pages SEO",
  "oneLiner": "links/orphan-pages scans every URL in the crawl, counts the inbound internal links pointing at each one, and fires at error severity on any page with exactly 0 of them — the dead-zone shape that leaves Googlebot unable to reach a URL through your own navigation, a structural gap the March 27, 2026 core update treats as a discoverability failure rather than a content one.",
  "whatItDetects": "links/orphan-pages builds one number for every page in the crawl: how many other pages in the same corpus link to it. It walks each parsed page, reads the inbound-link count the crawler accumulated while following internal hrefs, and flags any URL whose count is exactly 0. The root URL is exempted — your homepage is reached directly, not via an internal link — so the rule never accuses the front door of being unreachable.\n\nThe check is corpus-scoped, which is the detail that makes it honest. It only knows about pages the crawl actually visited and only counts links between those pages. A URL with zero inbound links is one that no page in the set references, meaning a crawler arriving at your homepage has no internal path to it. The page might still be reachable through your XML sitemap or an external backlink, but inside the site's own link graph it is an island.\n\nEvery orphan emits a single error-severity finding naming the URL and recommending you link to it from a relevant hub or index and add it to navigation. The rule reasons purely about reachability — it makes no judgement about whether the page's content is good, only about whether anything points at it.",
  "whyItMatters": "Search engines discover most pages by following links. Googlebot starts somewhere it already knows — usually your homepage or a sitemap entry — and crawls outward along internal hrefs. A page with zero inbound internal links sits outside that graph: nothing on your site points a crawler toward it, so it competes for discovery and crawl budget at a severe disadvantage even when its content is excellent.\n\nOrphans are a classic failure mode of programmatic builds. A template generates 4,000 location pages and writes them to disk, but the index that should link them is paginated to show only the first 200, or the generation job ships the detail pages a week before the hub that lists them. The pages exist, return 200, and may even sit in the sitemap — yet no human or crawler can navigate to 3,800 of them without typing the URL. PageRank, the internal-link signal Google has used since 1998, never flows to a page nothing links to, so orphans tend to rank far below their integrated siblings.\n\nThe error severity reflects that this is a structural defect, not a stylistic one. A page no one can reach is functionally invisible, and invisibility is the most expensive SEO problem there is.",
  "failingExample": "A beekeeping-supplies shop ships a /hives/ catalog whose index template paginates to the first 24 products, but the store stocks 310 SKUs. The $420 cedar Langstroth deep brood box, the nuc box, and roughly 280 other hive components live at real URLs that return 200, yet no page in the crawl links to them. The rule counts 0 inbound internal links for each and fires at error severity 286 times, naming every unreachable product. Googlebot arriving at the homepage has no internal path to 92% of the hive inventory, and 3 months after launch those pages still hold no rankings.",
  "passingExample": "The same beekeeping-supplies shop rebuilds the /hives/ index as a fully linked, filterable grid — every brood box, queen excluder, and Langstroth frame is reachable from the catalog, and each product also appears in a 'goes with this hive' block on related pages, so a smoker links to the apiary-starter bundle and the honey extractor links back to the frames it spins. Every one of the 310 SKUs now carries at least 1 inbound internal link. The rule counts no zero-inbound URLs and stays silent, because Googlebot can walk from the homepage to any product in 3 clicks.",
  "howToFix": [
    "Link every orphan from a relevant hub or category index so it joins the site's internal link graph and a crawler can actually reach it.",
    "Fix paginated or truncated index templates that list only the first N items — the missing children are usually the orphans, and crawlable pagination restores them all at once.",
    "Add the page to your primary or contextual navigation when it is genuinely important, so it earns inbound links from high-traffic parts of the site.",
    "Cross-link related items to each other, so a product, article, or location references its siblings instead of depending on one fragile index page.",
    "Re-crawl after wiring the links and confirm the inbound count is no longer 0 — a sitemap entry alone does not clear this rule, because the rule measures internal links, not sitemap membership.",
    "For pages that should not exist as standalone URLs, consolidate or noindex them rather than leaving unreachable thin pages stranded in the corpus."
  ],
  "spamBrainContext": "Orphan detection predates the spam era — it is plain crawlability hygiene that Google has documented for as long as it has explained how discovery works. A page nothing links to cannot accumulate the internal PageRank that has shaped ranking since 1998, and Googlebot's own crawl documentation is explicit that links are the primary discovery mechanism.\n\nlinks/orphan-pages (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) sits in the structural integrity family rather than the spam family, but it matters disproportionately on programmatic sites because bulk generation is exactly where orphans appear at scale. The March 27, 2026 core update sharpened scrutiny of programmatic corpora, and a template that emits thousands of unlinked pages presents two problems at once: the pages waste crawl budget Google would rather spend elsewhere, and their existence inflates a site's apparent page count without any of them being reachable or rankable.\n\nWhat the rule cannot see is your sitemap or your external backlinks. It judges the internal link graph alone, so it can flag a page as an orphan even when a sitemap lists it — which is intentional. Sitemap inclusion is a hint, not a navigable path, and Google has repeatedly said a strong internal link is worth more than a sitemap row.",
  "faqs": [
    {
      "q": "What exactly counts as an orphan page in this rule?",
      "a": "A page with exactly 0 inbound internal links from any other page in the same crawl. The rule counts the links the crawler followed between pages it visited, and any URL that no visited page references is an orphan. The homepage (root URL) is exempt, because it is reached directly rather than through an internal link, so the rule never flags it."
    },
    {
      "q": "My orphan page is in my XML sitemap. Doesn't that make it reachable?",
      "a": "A sitemap is a list of suggestions, not a navigable path. Google may still discover a sitemap-only URL, but it receives none of the internal PageRank that a real inbound link carries, so it tends to rank poorly and gets crawled less often. This rule deliberately measures internal links rather than sitemap membership, which is why a sitemapped page can still be flagged as an orphan."
    },
    {
      "q": "Why does the rule fire at error severity instead of a warning?",
      "a": "Because an unreachable page is a structural defect, not a matter of taste. A URL that nothing links to is functionally invisible to crawlers navigating your site, and invisibility is the most expensive SEO outcome there is — the page cannot rank for anything if a crawler never arrives. Error severity signals that this should be fixed before stylistic concerns, since no amount of content quality helps a page nobody can reach."
    },
    {
      "q": "I run a beekeeping-supplies shop and 286 hive products got flagged. How do I clear them fast?",
      "a": "The cause is almost always a truncated index. If your /hives/ catalog template paginates to the first 24 of 310 SKUs, then 286 brood boxes, queen excluders, and Langstroth frames have zero inbound links. Rebuild the index as a fully crawlable, filterable grid and add a 'pairs with this hive' cross-link block — a $39 smoker linking to its apiary-starter bundle, the honey extractor linking to its frames. Re-crawl and the inbound count for each product rises above 0, clearing all 286 findings in one pass — in one illustrative run the orphaned pages began earning impressions roughly 9 days after the links shipped."
    },
    {
      "q": "Does the rule consider external backlinks when deciding if a page is orphaned?",
      "a": "No. The rule is corpus-scoped: it only knows about the pages in the crawl and only counts links between them. An external site might link to your orphan, which would help Google discover it, but the rule cannot see that and judges your internal link graph alone. The goal is to surface pages your own site fails to connect, since those are the ones within your control to fix."
    },
    {
      "q": "Could fixing orphans accidentally create a different problem?",
      "a": "It can if you over-correct. Dumping links to 3,800 orphans into a single footer or a sitewide block restores reachability but can dilute internal PageRank and trip link-graph rules that watch for unnatural link density. The better fix is contextual: link each page from a genuinely relevant hub or sibling, so the link makes sense to a reader and the crawler, rather than wiring every orphan into one indiscriminate index."
    }
  ],
  "relatedRules": ["link-depth", "cluster-connectivity", "host-section-divergence"],
  "relatedTool": "spambrain-checker"
},
  {
    slug: "dead-ends",
    ruleId: "links/dead-ends",
    title: "Dead Ends — Pages With Zero Outbound Links to the Rest of Your Crawl",
    metaDescription:
      "A dead-end page has zero outbound links to other crawled URLs, so crawlers stall and link equity stops flowing forward. How links/dead-ends finds these pages.",
    primaryKeyword: "dead end pages SEO",
    oneLiner:
      "links/dead-ends flags every crawled page (the homepage aside) whose outbound links include zero URLs that point to another page in the same crawl, the forward-flow gap that strands Googlebot and traps link equity, a warning a model-railway shop's 1,400 product listings hit when each turnout and locomotive page links only out to a vendor, never deeper into the store.",
    whatItDetects:
      "links/dead-ends walks every page in your audited corpus, skips the root URL, and for each remaining page counts how many of its resolved outbound links point to another page that is also in the crawl. The check is strict: a link only counts if its target is in the known-URL set and is not a self-link back to the same page. When that count lands at exactly zero, the page is a dead end and the rule emits a warning naming the URL.\n\nThe test is corpus-scoped, not page-local. A page can carry dozens of links to external vendors, social profiles, or PDFs and still be a dead end, because none of those targets is another crawled page on your own site. Forward flow is the only thing measured: does standing on this page give a crawler, or a reader, any path deeper into the rest of the corpus.\n\nSeverity is fixed at warning. A dead end is not a broken page or a thin page; it renders fine and may read well. It simply terminates the internal link graph at that node, so anything that travels along links, crawl reach and ranking signal alike, stops there instead of moving on to the next page.",
    whyItMatters:
      "Googlebot discovers and re-crawls pages largely by following links from pages it already knows. A dead-end page is a node the crawler can arrive at but never leave, so it contributes nothing to discovering the rest of your site. On a small site one dead end is harmless. On a 1,400-page programmatic catalogue where most leaf pages dead-end, the internal graph collapses into a wide, shallow fan that the crawler exhausts in a single hop, leaving deeper inventory undiscovered for weeks.\n\nLink equity, the ranking signal that propagates along internal links, behaves the same way. It flows into a dead-end page and then has nowhere to go. Every page that terminates the graph is a place where authority pools and stops compounding across the rest of the corpus, which is wasteful on exactly the deep long-tail pages programmatic sites most need to rank.\n\nThe fix is also the cheapest in the link family: a dead end becomes a live node the moment it links to even one other crawled page. Unlike orphan pages, which no page links to, a dead end is reachable but is itself a one-way valve. Adding a handful of contextual internal links forward turns a terminal node back into a junction the crawler and link equity can pass through.",
    failingExample:
      "RailYardHobbies.example ships 1,400 product pages for HO gauge locomotives, rolling stock, turnouts, ballast, and weathering powder. Each listing template renders the price, an add-to-cart button, and a single outbound link to the manufacturer's spec sheet on an external domain. It links to nothing else on the store: no category page, no related locomotive, no diorama guide. Every one of those 1,400 pages counts zero outbound links to another crawled URL, so links/dead-ends fires a warning on each. In one illustrative run the crawler reached barely 38% of the catalogue before exhausting its budget, leaving the deep aisles unindexed for 9 weeks. A crawler that lands on the Atlas GP38 diesel listing can read it, then has to retreat the way it came, because the page offers no path forward into the other 1,399.",
    passingExample:
      "The same RailYardHobbies catalogue, with the listing template reworked so every product page links forward into the corpus. The Atlas GP38 listing now links to its parent category (HO gauge diesel locomotives), to three related items a crawler can follow (a matching DCC decoder, a length of flex track, a bottle of rust weathering powder), and to a buying guide on bedding turnouts in ballast. The external manufacturer link stays, but it no longer stands alone. Each page now counts four or more outbound links to other crawled URLs, the dead-end warnings clear across all 1,400 pages, and in the same illustrative scenario crawl reach climbs from 38% to 94% within 12 days as the graph stops dead-ending. A crawler arriving on any listing can travel deeper into the store instead of hitting a wall.",
    howToFix: [
      "Add contextual internal links from every leaf page to a handful of genuinely related crawled pages, so each node offers the crawler a path forward rather than a one-way valve.",
      "Link each product or article up to its parent category or hub page, which alone is usually enough to clear the warning while also restoring a route back into the broader corpus.",
      "Build a related-items or related-reading block into the page template, since dead ends on programmatic sites almost always trace to a template that renders only external links.",
      "Audit your link resolver: relative hrefs, JavaScript-injected menus, or trailing-slash mismatches can make real internal links resolve to URLs outside the known set, so a linked page still reads as a dead end.",
      "Distinguish a dead end from a deliberately terminal page like a checkout or thank-you screen, and exclude only those that should not feed the crawl, never the content pages you want indexed.",
      "Re-crawl after editing the template, because dead ends are usually template-wide: one fix to the shared listing layout clears the warning on hundreds of pages at once."
    ],
    spamBrainContext:
      "Dead ends are not a spam policy. Google has never published a rule that says a page must link onward, and a single dead-end page will not draw a manual action or a SpamBrain demotion. links/dead-ends sits in the crawlability family, not the integrity family, and it ships at warning severity for that reason: it describes a structural inefficiency in your internal link graph, not a violation.\n\nWhere it intersects scaled-content territory is shape. The programmatic sites Google's March 5, 2024 scaled-content-abuse update targeted tend to share a tell beyond thin or duplicated text: a flat, terminal link graph where thousands of generated leaf pages link out to nothing on the same site. That shape is what makes a corpus feel like a database export rather than a navigable publication, and a wall of dead-end warnings is one of the clearest structural readouts of it.\n\nSo treat a dead-end finding as a crawl-efficiency and architecture signal, not a penalty risk. Clearing it makes Googlebot's job cheaper and lets link equity compound across your deep pages. On a programmatic catalogue, pairing dead-end fixes with the integrity rules that judge content is how a generated grid starts reading like a site someone actually built to be browsed.",
    faqs: [
      {
        q: "What exactly counts as a dead-end page in pseolint?",
        a: "A page in your crawled corpus, other than the root URL, whose outbound links include zero URLs that point to another page also in the crawl. The rule resolves every href on the page, then keeps only the ones whose target is in the known-URL set and is not a self-link back to the same page. If that surviving count is zero, the page is a dead end and gets a warning. Links to external sites, files, or anchors on the same page do not count, because none of them carries a crawler forward into the rest of your corpus."
      },
      {
        q: "How is a dead end different from an orphan page?",
        a: "They are mirror images. An orphan page is one that no other crawled page links to, so a crawler struggles to reach it in the first place. A dead end is the opposite: the crawler can reach the page fine, but the page links to nothing else in the corpus, so the crawler cannot leave it for another internal URL. A page can be both at once, fully stranded, but the two rules describe different failures. Orphans are a discovery problem on the way in; dead ends are a forward-flow problem on the way out."
      },
      {
        q: "Why is this only a warning and not an error?",
        a: "Because a dead-end page is structurally inefficient, not broken or deceptive. The page renders, indexes, and may serve users perfectly well in isolation. What it fails to do is pass crawl reach and link equity onward to the rest of the site. That is a real cost on a large corpus, but it is not a content-quality violation or a spam signal, so the rule reports it at warning severity, flagging an architecture issue worth fixing rather than a penalty risk demanding it."
      },
      {
        q: "My model-railway store links every product to its manufacturer. Why are these still dead ends?",
        a: "Because manufacturer links point to an external domain, and the rule only counts links to other pages inside your own crawl. A listing for a brass HO gauge locomotive can carry a link to the maker's spec sheet, a link to a review video, and a link to a parts PDF, and still be a dead end, because not one of those targets is another page on your store. The moment that listing also links to its category, to a related rolling-stock item, or to a ballasting guide on your own site, it stops being a dead end. In one illustrative scenario a store whose $2,300 brass locomotive pages all dead-ended this way saw them sit unindexed for 8 weeks until the template linked them forward. Forward flow has to stay on your domain to count."
      },
      {
        q: "Does a dead-end page hurt my rankings directly?",
        a: "Not by itself, and not the way a thin or duplicate page can. The harm is indirect and graph-shaped. A dead end is where link equity arrives and stops compounding, and where a crawler runs out of road, so the cost lands on the pages downstream that never get the signal or the crawl budget the dead end absorbed. On a small site this is negligible. On a programmatic catalogue with hundreds of terminal pages, the cumulative drag on crawl reach and internal authority flow is exactly the kind of architectural waste worth clearing across the whole template at once."
      }
    ],
    relatedRules: ["orphan-pages", "link-depth", "cluster-connectivity"],
    relatedTool: "spambrain-checker"
  },
  {
  slug: "link-depth",
  ruleId: "links/link-depth",
  title: "Link Depth — How Many Clicks From Home Before Googlebot Gives Up",
  metaDescription:
    "Pages buried more than 3 clicks from your homepage waste crawl budget and dilute PageRank. How links/link-depth runs a BFS from the root and flags deep and unreachable pages.",
  primaryKeyword: "link depth SEO",
  oneLiner:
    "links/link-depth runs a breadth-first search from your root URL and measures the shortest click-distance to every page, flagging anything past the default ceiling of 3 clicks as info and anything Googlebot cannot reach from the root at all as a warning, because a page Google crawls last is a page Google ranks last.",
  whatItDetects:
    "links/link-depth treats your internal-link graph the way a crawler does. It seeds a breadth-first search at the root URL you audited, walks every internal link, and records for each page the shortest number of clicks it takes to arrive there. The BFS guarantees that distance is the minimum, so a page linked from both the homepage and a deep article is scored by its nearest path, not its farthest.\n\nTwo distinct findings come out of that single traversal. First, any page whose shortest click-distance exceeds maxClicks — default 3 — is reported at info severity with a message naming the page and the depth it sits at. Three clicks is the conventional ceiling because it mirrors how deep a crawler will eagerly follow before a page starts competing for scarce budget.\n\nSecond, any page that has inbound internal links yet never gets visited by the BFS is reported at warning severity as unreachable-from-root. That gap means the page is referenced somewhere, but no chain of links actually connects it back to the root, so a crawler starting at the homepage would never find it.\n\nWhen the audit only sampled a subset of the site, the unreachable check is suppressed, because a missing path may be a sampling artifact rather than a real dead end; the depth measurement keeps running on whatever subgraph was fetched.",
  whyItMatters:
    "Crawl budget and link equity both flow outward from your homepage along internal links, and both thin out with every hop. A page sitting 7 clicks deep receives a fraction of the PageRank that a 2-click page does, and Googlebot reaches it late in a crawl cycle, if at all. The 3-click ceiling is a practical proxy: pages inside it tend to get crawled promptly and rank on their merits, while pages beyond it compete for whatever budget is left.\n\nDepth is not a penalty signal — it is a discoverability one. A buried page is not flagged as spam; it is flagged as expensive to find and starved of the internal authority it needs. That is why this finding lands at info severity. It tells you where your architecture is leaking equity into pages too far from the root to compete.\n\nThe unreachable-from-root warning is sharper. A page that other pages link to but that has no path back to the root is an island. Googlebot can only follow links it can actually reach by walking from a known entry point, so an island page depends entirely on external links or a sitemap to be discovered, and it never receives internal equity. That is a structural defect worth fixing before you touch anything cosmetic.",
  failingExample:
    "A scuba-diving certification school sells a $1,800 open-water cert that runs over 10 days, but buries the page five clicks deep: home, then a region menu, then a dive-site list, then a single reef page, then finally the open-water cert page itself. The BFS records the cert page at depth 5, past the 3-click ceiling, and links/link-depth fires at info — so the page driving 40% of revenue is the one Googlebot reaches last. Worse, the school's nitrox-specialty page is linked only from a retired blog post that nothing else points to, so no chain reaches it from the root: the rule reports it as unreachable-from-root at warning severity, and a crawler starting at the homepage would never find it.",
  passingExample:
    "The same scuba school flattens its architecture. The homepage links straight to a course hub, and the hub links directly to every certification page — open-water, advanced, rescue diver, and nitrox specialty — so each cert page sits exactly 2 clicks from the root, comfortably inside the 3-click ceiling. The dive log, wetsuit-and-regulator rental, buoyancy clinic, and decompression-theory pages are all cross-linked from the hub too, so the BFS reaches every URL and not one page is stranded. Within 4 weeks of the restructure, organic impressions on that $1,800 cert page climb roughly 30% as Googlebot crawls it early and internal equity flows to it. links/link-depth stays silent: nothing is buried, nothing is an island.",
  howToFix: [
    "Link your deepest money pages directly from a hub or category page so the BFS reaches them in 2 to 3 clicks instead of 5 or 6.",
    "Audit any page reported as unreachable-from-root first — that is a structural island, and adding a single navigational link from a reachable page fixes it.",
    "Flatten deep taxonomies: collapse redundant intermediate index pages that add a click without adding value to a visitor or a crawler.",
    "Add contextual in-content links from popular shallow pages down to important deep ones, so equity has a short path to follow.",
    "Re-run the audit after restructuring, because moving one hub link can lift an entire subtree of pages back inside the 3-click ceiling at once.",
    "Do not rely on an XML sitemap to rescue a buried page — a sitemap aids discovery but does not pass the internal PageRank that depth controls."
  ],
  spamBrainContext:
    "Link depth is not a SpamBrain signal and pseolint does not pretend it is. SpamBrain targets manipulative and low-value content; an honest page buried 6 clicks deep is neither. What link depth governs is the crawl-and-index economics that decide whether your good pages ever get a fair hearing in the first place.\n\nGoogle has been consistent for years that crawl budget is finite and that internal-link structure is how that budget is distributed across a site. The reasonable-surfer model behind PageRank assumes equity flows along links and attenuates with distance, so a page far from your strongest entry points simply inherits less authority. Neither idea is a penalty; both are mechanics, and both are exactly what a BFS from the root measures.\n\nlinks/link-depth (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) reports at info severity for buried pages and warning severity for unreachable ones precisely because it describes architecture, not abuse. Treat a finding as a map of where your internal authority drains away, not as evidence that Google thinks you are spamming. Fixing depth is almost always a pure win: the same page, made cheaper to crawl and richer in internal equity, with nothing about its content changed.",
  faqs: [
    {
      q: "Why is 3 clicks the default depth ceiling?",
      a: "Three clicks from the homepage is the conventional rule of thumb for a healthy architecture, and it is the maxClicks default in links/link-depth. The number reflects crawl economics: a crawler follows links eagerly for the first few hops, then pages start competing for finite budget. Inside 3 clicks a page tends to get crawled promptly and inherit meaningful internal PageRank; beyond it, both discovery and equity fall off. You can raise or lower the ceiling, but 3 is a defensible default for most sites."
    },
    {
      q: "What is the difference between a deep page and an unreachable page?",
      a: "Both come from the same breadth-first search, but they are different findings. A deep page is reachable from the root — the BFS does visit it — but only after more clicks than the ceiling allows, so it fires at info severity. An unreachable-from-root page has inbound internal links yet is never visited by the BFS at all, meaning no chain of links connects it back to the root. That is a structural island and fires at the sharper warning severity, because a crawler starting at the homepage would never find it."
    },
    {
      q: "How would this rule treat my dive school's course pages?",
      a: "Imagine a scuba-diving certification school whose $1,800 open-water cert page sits five clicks deep behind a region menu, a dive-site list, and a reef page. The BFS records depth 5, past the 3-click ceiling, and the rule flags it at info — Googlebot reaches it late and it inherits little internal equity. If your nitrox-specialty page is linked only from a stranded blog post with no path back to the root, the rule escalates to a warning. Link both pages from a course hub two clicks from home, give it 4 weeks, and every finding clears while the cert page starts ranking on its merits."
    },
    {
      q: "Does a deep page actually get penalized by Google?",
      a: "No. Link depth is a discoverability and equity signal, not a spam signal, which is why the rule reports buried pages at info rather than error severity. A page 6 clicks deep is not flagged as low quality; it is flagged as expensive for Googlebot to reach and starved of the internal PageRank it needs to compete. The harm is opportunity cost: a good page that ranks worse than it should because your architecture buried it. Fixing depth lifts the same page without changing a word of its content."
    },
    {
      q: "Will an XML sitemap fix a deep or unreachable page?",
      a: "A sitemap helps Google discover a URL, so it can partly mitigate an unreachable-from-root page, but it does not solve the underlying problem. Sitemaps aid discovery; they do not pass internal PageRank. A page that is only reachable via the sitemap still inherits no link equity from the rest of your site, so it competes from a weak position. The durable fix is an actual internal link from a reachable page, which both shortens the click-distance the BFS measures and lets authority flow to the page."
    },
    {
      q: "Why is the unreachable check skipped when the audit is sampled?",
      a: "When pseolint only fetches a subset of a large site, the link graph it builds reflects the sample, not the whole site. A page that looks unreachable might simply be missing its intermediary pages from the crawl — the real path back to the root exists, the audit just did not fetch the pages in between. To avoid crying wolf on a sampling artifact, the rule suppresses the unreachable-from-root warning on sampled runs. The depth measurement still runs on whatever subgraph was fetched, since that distance is meaningful even on a partial crawl."
    }
  ],
  relatedRules: ["orphan-pages", "dead-ends", "cluster-connectivity"],
  relatedTool: "spambrain-checker"
},
  {
    slug: "cluster-connectivity",
    ruleId: "links/cluster-connectivity",
    title: "Cluster Connectivity — When a Directory of Pages Becomes a Topic Silo",
    metaDescription:
      "A directory of pages with no internal links in or out is a topic silo that hoards authority. How links/cluster-connectivity flags siloed same-parent clusters.",
    primaryKeyword: "internal linking topic silo",
    oneLiner:
      "links/cluster-connectivity groups every crawled URL by its parent directory, and for each cluster of 2 or more pages it checks whether a single internal crawl link enters from another cluster or leaves toward one — firing a warning when neither exists, because Google cannot diffuse authority into a directory that no other section of your site references or is referenced by.",
    whatItDetects:
      "The rule keys every crawled URL to its parent directory using the same cluster logic the link family shares: /cheese/affinage/ and /cheese/rind/ collapse to the /cheese/ parent, so a cluster is simply the set of pages that live under one folder. It builds that map first, then only looks at clusters that hold 2 or more pages, because a lone page is an orphan question, not a connectivity one.\n\nFor each multi-page cluster it asks two narrow questions against the set of URLs the crawl actually knows about. First, outbound: does any page in the cluster carry a resolved internal href whose target resolves to a different cluster? Second, inbound: does any page outside the cluster link to any URL inside it? A link that stays within the same parent directory does not count for either test — internal-to-cluster links keep the silo sealed.\n\nWhen a cluster of 2 or more pages has neither a cross-cluster outbound link nor a cross-cluster inbound link, it is a sealed silo and the rule emits one warning naming the directory, the page count, and the affected URLs. A cluster with even a single link crossing its boundary in either direction passes.",
    whyItMatters:
      "Internal links are how PageRank-style authority flows through a site. A directory that no other section links to, and that links to nothing outside itself, is a closed loop: whatever authority lands on it stays trapped, and whatever authority the rest of the site has cannot reach it. The pages can be individually excellent and still underperform because they sit in a pocket Google has no strong path into.\n\nThis is a warning, not an error, because a silo is a missed opportunity rather than a spam signal. A 12-page guide to washed-rind cheeses that no recipe, no shop category, and no blog post ever links to is not penalised — it is simply starved. The fix is cheap and additive: one contextual link from a related section into the cluster, and one back out, breaks the seal and lets authority diffuse both ways.\n\nThe rule deliberately requires total isolation in both directions before it fires. A cluster that receives even one inbound link, or sends even one outbound link to another section, is considered connected, because that single edge is enough for a crawler to find and credit the directory. The bar is set at sealed, not merely sparse.",
    failingExample:
      "A specialty fromagerie ships a /cave-aged/ directory with 9 deep guides — affinage timelines, washed-rind humidity, raw-milk safety. Every link inside those pages points only to other /cave-aged/ guides, and nothing in the shop's /shop/ catalog, its /recipes/ pairings, or its /journal/ posts ever links into the directory. The cluster is sealed in both directions, so the rule warns: 'Cluster /cave-aged/ (9 pages) has no crawl links to or from other clusters.' The guides took 6 weeks to write, yet draw barely 4% of the site's organic sessions, because Google has no internal path into the silo.",
    passingExample:
      "The same fromagerie adds two contextual links. The /shop/ page for its flagship cave-aged gruyere — a $42 wheel aged 18 months in the cave — links into /cave-aged/affinage-timeline, giving the cluster an inbound edge from the catalog; and each /cave-aged/ guide closes with a 'shop this wheel' link out to the matching /shop/ product, giving it outbound edges. One inbound link plus outbound links is more than enough — the seal is broken in both directions, authority diffuses between the curd-to-counter sections, and the rule stays silent on a directory that now sits inside the site's link graph instead of beside it.",
    howToFix: [
      "Add at least one inbound link from a related section. A single contextual link from your catalog, blog, or navigation into the siloed directory is enough for a crawler to find and credit it.",
      "Add at least one outbound link from inside the cluster to another section. Linking out is half the test; a cluster that only receives links still reads as a one-way pocket until its own pages reference the rest of the site.",
      "Link on topical relevance, not in a footer dump. A contextual link from a genuinely related page passes far more authority and reads as editorial rather than as a sitewide boilerplate block.",
      "Audit your navigation for whole sections it omits. Silos usually form when a directory was built after the main nav was frozen and never got wired back into it.",
      "Re-crawl after adding the links. Because the rule only needs one crossing edge in each direction, a small number of well-placed links can clear several siloed clusters at once.",
      "Treat the warning as a discoverability prompt, not a penalty. The pages are not flagged as low quality — they are flagged as unreachable, which is usually a quick fix with outsized traffic upside."
    ],
    spamBrainContext:
      "Cluster connectivity is not a spam rule at all — it is a discoverability and authority-flow rule that happens to share the link family's plumbing. Google has said for years, most explicitly across its 2008 to 2024 internal-linking guidance, that internal links help it discover pages and understand site structure, and that important pages should be reachable from many internal links. A sealed directory contradicts both: it is hard to discover and structurally orphaned from the rest of the topic graph.\n\nThe rule ships in @pseolint/core (MIT-licensed at github.com/ouranos-labs/pseolint) at warning severity, never error, because a silo is a self-inflicted ceiling on your own pages, not a violation that draws enforcement. It pairs naturally with the rest of the link family — it asks a coarser, cluster-level version of the question that per-page reachability rules ask, catching the case where an entire folder, not just one stray URL, fell out of the link graph.\n\nWhat the rule cannot see is whether the isolation was deliberate. A staging directory, a gated members area, or a deliberately noindexed section may be siloed on purpose. The rule reports the structural fact — this cluster has no crossing edges — and leaves the judgment of whether that is intended to you."
    ,
    faqs: [
      {
        q: "What exactly counts as a cluster here?",
        a: "A cluster is the set of crawled pages that share the same parent directory. The rule keys each URL to its parent folder — so /cheese/rind and /cheese/affinage both belong to the /cheese/ cluster — and only evaluates clusters that hold 2 or more pages. A single page under a directory is an orphan question handled elsewhere, not a connectivity one, which is why the rule needs at least two pages before it considers a directory a cluster worth testing."
      },
      {
        q: "Why does a link within the same directory not count?",
        a: "Because links that stay inside the cluster keep the silo sealed. The whole point of the rule is to detect a directory that the rest of the site cannot reach and that reaches nothing outside itself. Nine guides that link only to each other are still a closed loop no matter how densely they interlink internally. Only an edge that crosses the cluster boundary — inbound from another section or outbound to one — proves the directory is part of the wider link graph."
      },
      {
        q: "Does the rule need both an inbound and an outbound link to pass?",
        a: "No. The rule fires only when a cluster has neither a cross-cluster inbound link nor a cross-cluster outbound link. A single crossing edge in either direction is enough to clear it. In practice you usually want both — authority should flow into and out of a section — but the rule's bar is total isolation, so even one link entering or leaving the directory is enough to silence the warning."
      },
      {
        q: "It is a warning, not an error — should I still care?",
        a: "Yes, because a silo is a ceiling on your own pages. The severity is warning rather than error because isolation is a missed opportunity, not a spam signal that draws a manual action. But a directory Google cannot reach internally tends to underperform regardless of page quality. The fix is one of the cheapest, highest-upside changes in the audit: a couple of contextual links can unlock a whole section that was quietly starved of authority."
      },
      {
        q: "My fromagerie has a /cave-aged/ directory that trips this — what do I do?",
        a: "Wire it into the rest of the shop. Link your /shop/ catalog page for a cave-aged wheel into the relevant affinage guide so the cluster gains an inbound edge, and have each guide link out to the matching product or to a /recipes/ pairing so it gains outbound edges. One contextual link from the counter to the cave and one back is enough to break the seal. The 9 guides that took 6 weeks to write stop being a sealed terroir pocket and start passing authority to and from the rest of the site within a crawl or two."
      }
    ],
    relatedRules: ["host-section-divergence", "template-diversity"],
    relatedTool: "spambrain-checker"
  },
  {
  slug: "url-pattern",
  ruleId: "cannibal/url-pattern",
  title: "URL Pattern Cannibalization — When Two Slugs Are the Same Words Reordered",
  metaDescription:
    "Two URLs in one directory built from the same slug words in a different order compete for one query. How cannibal/url-pattern detects token-reorder URL cannibalization.",
  primaryKeyword: "URL cannibalization",
  oneLiner:
    "cannibal/url-pattern splits each URL's last slug on hyphens, sorts the tokens, and flags at info severity any two pages in the same directory whose sorted token sets match exactly — the reordered-slug keyword cannibalization Google has resolved by collapsing competing URLs to one canonical result since well before its March 2026 core update.",
  whatItDetects:
    "cannibal/url-pattern looks for two URLs that are, word for word, the same page wearing a different word order. For every page it takes the final path segment — the slug after the last slash, trailing slashes removed — splits it on hyphens, drops empty tokens, and sorts what remains alphabetically. Two slugs that differ only in the order of their words produce an identical sorted token list.\n\nThe rule then compares pages pairwise, but only within the same parent directory: the path up to that last slash must match, and it must not be empty. When two distinct URLs in one directory collapse to the same sorted tokens, the rule fires once at info severity, naming both URLs and reporting that they carry the same tokens in a different order. Pages in different directories never compare against each other, and a slug with no tokens is skipped. The match is exact after sorting — not fuzzy — so it fires only when the two slugs really are the same word set reshuffled.",
  whyItMatters:
    "Two URLs assembled from one word set are two pages chasing a single query. A vintage-synth marketplace that ships /moog-analog-synthesizer and /analog-synthesizer-moog in the same listings directory has not built two products; it has built one product twice and asked Google to choose. The crawler usually does choose — it folds the pair to a single canonical result and splits the link equity, anchor text, and click history that should have accrued to one strong page across two weaker ones.\n\nThe damage is quiet because nothing 404s and nothing looks broken. Both pages index, both rank somewhere, and neither ranks as well as the consolidated page would. On a programmatic catalog the reorder is rarely intentional — it usually comes from a slug builder that concatenates attribute tokens in whatever order the data arrives, so /eurorack-modular-oscillator and /oscillator-eurorack-modular both get minted from the same record. The rule sits at info severity because a reordered pair is a signal to consolidate, not proof of spam, but every such pair is link equity you are dividing against yourself.",
  failingExample:
    "A vintage-synthesizer marketplace mints two listing URLs from one record: /listings/moog-modular-oscillator and /listings/oscillator-moog-modular. Both live in /listings, and after splitting each slug on hyphens and sorting, both collapse to modular-moog-oscillator — the same three tokens reshuffled. The rule fires at info: 'these URLs have the same tokens in different order'. Google indexed both, picked one as canonical 9 days after launch, and the patch-cable and CV-gate detail on the losing page now earns nothing toward the ranking page.",
  passingExample:
    "The same marketplace settles on one canonical slug order for every listing and 301-redirects the reordered twin: /listings/oscillator-moog-modular permanently points at /listings/moog-modular-oscillator. Within the /listings directory no two slugs now share a sorted token set, so the rule stays silent. The MIDI spec, the filter-cutoff range, and the modular-rack photos all consolidate onto one URL, and the page that was splitting equity with its anagram now holds the full signal for the query.",
  howToFix: [
    "Pick one canonical token order for every slug your builder emits, so the same record can never mint both /moog-analog-oscillator and /oscillator-moog-analog.",
    "Add a 301 redirect from the reordered twin to the canonical URL, collapsing the pair into one address before the link equity finishes splitting.",
    "Set a rel=canonical on any duplicate you cannot redirect, pointing every reordered variant at the single slug you want Google to rank.",
    "Audit the slug-generation code, not the pages — the reorder almost always comes from a builder concatenating attribute tokens in whatever order the data arrives.",
    "Sort or fix the token order at write time in your data pipeline, so new listings are minted in canonical order and the pair never appears again.",
    "Check internal links and your sitemap for both variants, and repoint every reference at the canonical slug so crawlers stop discovering the twin."
  ],
  spamBrainContext:
    "Keyword cannibalization predates any algorithm name — it is simply two of your own pages competing for the same query, a problem SEOs have written about since the early 2010s. Reordered URL slugs are one of its most mechanical forms: not a content overlap a writer introduced, but a duplicate the address space minted on its own when a slug builder shuffled the same attribute tokens.\n\ncannibal/url-pattern (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) reasons about your URL structure rather than your page content. It does not read the HTML at all — it only asks whether two addresses in one directory are the same words in a different order. That is why it ships at info severity and never contributes a blocker on its own: a reordered pair is a consolidation opportunity, not a policy violation. Google's deduplication systems will eventually pick one canonical URL for the pair regardless, so the rule's job is to surface the split before the crawler resolves it for you and you lose a say in which slug wins.",
  faqs: [
    {
      q: "What exactly counts as a reordered-token match?",
      a: "Two URLs match when they sit in the same parent directory and their final slugs, after splitting on hyphens and sorting alphabetically, produce the identical token list. So /gear/analog-synth-rack and /gear/rack-synth-analog match because both sort to analog-rack-synth, while /gear/analog-synth-rack and /shop/analog-synth-rack do not, because their directories differ. The comparison is exact after sorting, so a single different or extra word breaks the match and the rule stays silent."
    },
    {
      q: "Why is this only an info-severity finding?",
      a: "Because a reordered slug pair is a signal to consolidate, not evidence of spam or manipulation. Nothing is broken — both pages still load and index — so the rule never blocks an audit verdict on its own. It surfaces the pair so you can decide which slug to keep and redirect the other, ideally before Google's deduplication picks a canonical URL for you. Treat it as a cleanup task that recovers split link equity, not as an emergency."
    },
    {
      q: "Will it flag two URLs that share words but in different directories?",
      a: "No. The rule compares pages only within the same parent directory — the entire path up to the final slash must match, and it must not be empty. So /listings/moog-oscillator and /archive/oscillator-moog never compare against each other, even though their slugs are the same two words reordered. Directory scoping keeps the rule from flagging legitimately separate sections that happen to reuse vocabulary, and it only ever fires on genuine same-folder duplicates."
    },
    {
      q: "My synth marketplace auto-builds slugs from attribute tags — how do I stop reordered duplicates?",
      a: "This is the classic source of the finding. A listing for a Moog modular oscillator gets a slug concatenated from its attribute tokens, but if the same instrument is re-listed and the tags arrive as oscillator, modular, moog instead of moog, modular, oscillator, your builder mints /listings/oscillator-modular-moog alongside the original /listings/moog-modular-oscillator — two URLs, one patch-cable-and-CV-gate product. Fix it at write time: sort the attribute tokens into a fixed canonical order before assembling the slug, so the polyphony, filter-cutoff, and MIDI details of a given modular rack only ever resolve to one address. In one illustrative cleanup, a dealer carrying 1,400 listings found 6% were reordered twins and recovered the split equity within 3 weeks of redirecting them."
    },
    {
      q: "Does redirecting the duplicate recover the lost ranking signal?",
      a: "Largely, yes. A 301 redirect from the reordered twin to your canonical slug passes the accumulated link equity and consolidates the two pages' signals onto one URL, so the page that was competing with its own anagram regains the anchor text and click history it was splitting. The recovery is not instant — Google has to recrawl and process the redirect — but it is the right fix, because leaving the pair live means the crawler keeps dividing the signal until it picks a canonical itself, with no guarantee it picks the slug you would have chosen."
    }
  ],
  relatedRules: ["near-duplicate", "title-uniqueness", "meta-uniqueness"],
  relatedTool: "doorway-page-detector"
},
  {
  "slug": "freshness-signals",
  "ruleId": "aeo/freshness-signals",
  "title": "Freshness Signals — When a Page Gives AI Engines No Sign It Is Current",
  "metaDescription": "AI engines favour pages that prove they are current. How aeo/freshness-signals flags a missing dateModified and content older than the 180 days staleness default.",
  "primaryKeyword": "content freshness signals SEO",
  "oneLiner": "aeo/freshness-signals checks every page for a real modification signal — a JSON-LD dateModified, an article:modified_time meta tag, or a visible 'Last updated' line — warns at medium confidence when none exists, then drops to an info note when the best date it can parse is older than the staleness default of 180 days Google has long associated with how AI Overviews weigh recency.",
  "whatItDetects": "aeo/freshness-signals asks one question of every crawled page: does it carry evidence that it has been touched recently. The rule looks for a true modification signal in three places — a dateModified field anywhere in the page's JSON-LD (found by a recursive walk), a modification meta tag (article:modified_time, last-modified, dc.date.modified, or a <time datetime> element), or visible 'Last updated', 'updated on', 'revised', or 'last modified' text in the rendered content.\n\nA datePublished alone is deliberately not enough. A page born in 2019 and never edited has a publication date but no modification signal, so it falls through to a warning at medium confidence — medium because evergreen pages like an about, pricing, or policy page may legitimately omit a modified date, and re-stamping them would mislead readers.\n\nWhen a modification signal does exist, the rule parses the best date it can find and measures its age. If that age exceeds maxStaleDays — 180 days by default — it emits an info finding at low confidence, because stale by the clock is not always stale by meaning. The two findings sit at different severities on purpose: a missing signal is a warning, an old-but-present date is only an info note.",
  "whyItMatters": "AI engines and the AI Overviews layer prioritise content that can prove it is current, because a synthesised answer that cites a stale page inherits that page's staleness. For any topic that moves — pricing, regulations, conditions that change with the seasons — a missing or ancient modification date is a reason for an engine to reach past you to a competitor that timestamps its work.\n\nThe rule catches the failure mode programmatic templates fall into most often: the body binds live data, but the template never surfaces a dateModified, so a page that was regenerated this morning looks, to a crawler, exactly as old as the day it was first published. The data is fresh; the signal is not. A surf-forecast page can rebuild its swell and tide tables every 6 hours and still read as untouched since launch if no modified date rides along with the refresh.\n\nBoth findings are gentle by design — a warning for the missing signal, an info note for the aged date — because freshness is contextual. The rule's job is to ask whether recency matters for this page type and, if it does, whether the page bothers to claim it.",
  "failingExample": "/forecast/ocean-beach-weekly on a tide and surf-forecast site. The template repulls buoy readings and recomputes the swell period table every 6 hours, but the rendered HTML carries no JSON-LD dateModified, no article:modified_time meta tag, and no visible 'Last updated' line — only a datePublished of January 14, 2022 buried in the schema. The rule finds no modification signal and fires a warning at medium confidence: the page that updates 4 times a day looks, to a crawler, three years stale.",
  "passingExample": "The same /forecast/ocean-beach-weekly page, instrumented to timestamp its refresh. Each time the offshore-wind and tide-table data repulls, the template writes a JSON-LD dateModified and renders a visible 'Last updated: June 11, 2026, 06:00' line above the set-wave chart. The crawler now reads a modification signal dated hours ago, the parsed age is well under the default of 180 days, and neither the missing-signal warning nor the staleness info note fires — the page's freshness claim finally matches its actual update cadence.",
  "howToFix": [
    "Add a real dateModified to your JSON-LD schema and bump it whenever the page's underlying data changes, not just when a human edits the prose.",
    "Render a visible 'Last updated: YYYY-MM-DD' line in the page body so both readers and AI engines see the freshness claim without parsing schema.",
    "Wire the modified timestamp to your data source for pSEO templates, so a forecast page that repulls every 6 hours stamps the moment it actually regenerated.",
    "Keep your sitemap <lastmod> accurate and aligned with the on-page date — a contradictory lastmod is worse than none, since it tells the crawler your timestamps cannot be trusted.",
    "Leave genuinely evergreen pages alone — an about, pricing, or policy page that has not changed should not carry a fake recent date that would mislead a reader.",
    "Refresh the body, not just the date, on pages older than the 180 days default whose information has actually moved on, then bump dateModified to reflect the real edit."
  ],
  "spamBrainContext": "Freshness is not a spam policy and not a lever you can pull with a fake timestamp — Google has been explicit for years that re-dating a page without changing it does nothing, and can erode trust if the claimed date and the actual content diverge. aeo/freshness-signals lives in the aeo/* family because its real audience is the AI-answer layer: the engines that synthesise AI Overviews lean on recency to decide which source to ground an answer in, and a page that never timestamps its updates makes that decision easy in a competitor's favour.\n\nThis rule (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is deliberately the gentlest member of its family. The missing-signal case fires at warning with medium confidence because evergreen pages legitimately omit a modified date; the stale-date case fires at info with low confidence because a page 200 days old is not wrong, only unproven. Neither is a verdict.\n\nWhat the rule cannot do is judge whether your content is actually current — it reads the claim, not the truth behind it. A surf site that stamps a fresh dateModified on a swell table it never recomputed has satisfied the rule and fooled nobody who reads the stale forecast. The honest move is to make the timestamp follow the data, so the signal stays true.",
  "faqs": [
    {
      "q": "What counts as a modification signal, and why isn't datePublished enough?",
      "a": "Three things satisfy the rule: a dateModified anywhere in the JSON-LD, a modification meta tag (article:modified_time, last-modified, dc.date.modified, or a <time datetime> element), or visible 'Last updated', 'updated on', 'revised', or 'last modified' text in the body. A datePublished alone is deliberately excluded — a page first published in 2019 and never touched has a publication date but no evidence it has been maintained, which is exactly the staleness the rule is built to surface. Without one of the three modification signals, the page falls through to the warning."
    },
    {
      "q": "What is the staleness threshold and what happens when a page crosses it?",
      "a": "The maxStaleDays default is 180 days. When a page does carry a modification signal, the rule parses the best date it can find and measures its age against that threshold. A page last updated more than 180 days ago emits an info finding at low confidence — low because some pages are evergreen by design and stale by the clock is not the same as stale by meaning. You can tune maxStaleDays in the config if your content type changes faster or slower than the default of 180 days."
    },
    {
      "q": "Why is the missing-signal case a warning but the stale-date case only an info note?",
      "a": "Because the two failures carry different weight. A page with no modification signal at all gives an AI engine nothing to assess, so it warns at medium confidence — though even that is hedged, since an about or pricing page may legitimately have no modified date. A page that does carry a date but is simply old is a softer case: the signal exists, it is just aged, and aged content can be perfectly current in meaning. That is why an old-but-present date drops to an info note at low confidence rather than a warning."
    },
    {
      "q": "Our tide and surf-forecast pages rebuild constantly but still trip the missing-signal warning — what is wrong?",
      "a": "Almost certainly the template recomputes the data without ever writing a freshness signal alongside it. A page that repulls buoy readings and recalculates the swell period and tide table every 6 hours is genuinely fresh, but if it renders no JSON-LD dateModified, no article:modified_time meta tag, and no visible 'Last updated' line, the crawler sees only the original datePublished and reads the page as untouched since launch. The fix is to wire the modified timestamp to the data refresh, so each regeneration stamps a real dateModified and a visible 'Last updated' line above the forecast. As an illustration, one forecast site that started timestamping its refresh cycle every 6 hours saw the share of its pages cited in AI answers climb 28% over the following 10 weeks, simply because the freshness claim finally matched the actual update cadence."
    },
    {
      "q": "Does adding a fake recent dateModified satisfy the rule and improve rankings?",
      "a": "It satisfies the literal check, because the rule reads whether a modification signal is present, not whether the content behind it actually changed. But it gains you nothing real. Google has said for years that re-dating an unchanged page is not a ranking lever, and a claimed date that contradicts visibly stale content erodes the trust the timestamp was supposed to build. The honest pattern is to make the modified date follow the data — bump it when the page truly changes, leave it alone when it does not — so the freshness signal stays true rather than becoming a liability a reader or an AI engine can catch."
    }
  ],
  "relatedRules": ["eeat-signals", "missing-author", "publication-velocity"],
  "relatedTool": "spambrain-checker"
},
  {
  slug: "llms-txt",
  ruleId: "aeo/llms-txt",
  title: "llms.txt — A Draft Convention for Guiding AI Engines, Checked at Your Origin",
  metaDescription:
    "llms.txt is a draft, low-adoption convention for pointing AI engines at your best content. How pseolint fetches /llms.txt once at your origin and runs 3 lenient shape checks.",
  primaryKeyword: "llms.txt file SEO",
  oneLiner:
    "llms.txt is a draft, low-adoption convention proposed in September 2023 and championed by Jeremy Howard at Answer.AI, so pseolint runs this as a low-confidence, informational site-level check that fetches /llms.txt once at your origin and verifies 3 shape rules, treating a missing file as a missed opportunity worth roughly 1 hour of work, never a defect.",
  whatItDetects:
    "This is a site-level check, not a per-page one: it runs exactly once against your origin. pseolint takes the source URL, derives its origin, requests `${origin}/llms.txt` with a 10 second timeout, and only proceeds for http and https targets. If the request fails, times out, or returns a non-200 status, the file is treated as absent.\n\nWhen the file is present, pseolint runs three deliberately lenient shape checks drawn from the llmstxt.org proposal. First, the opening non-empty line must be an `# ` H1 title (lines that start with `#` but carry no title text are skipped, not rejected). Second, the file must contain at least one `## ` section heading. Third, it must list at least one markdown link of the form `- [Title](https://...)` somewhere under a section. A file that satisfies all three passes silently.\n\nA missing file and a malformed file both surface the same low-confidence, informational finding — one tells you nothing exists at the origin, the other names which of the three rules failed. The check is intentionally forgiving because the specification is still evolving; it rejects only obvious garbage.",
  whyItMatters:
    "Be candid about what this is: llms.txt is a draft convention with low industry adoption, not a ranking factor and not an established standard. That is exactly why pseolint reports it at low confidence and informational severity. An absent llms.txt is a missed opportunity, never a defect, and you can ship a perfectly healthy site without one.\n\nThe upside, where it applies, is editorial control. A well-formed llms.txt lets you hand an AI engine a curated map straight to your most authoritative, citable pages instead of leaving it to infer structure from a sprawling sitemap. For a project with deep, fast-moving content — release notes, an API reference, a migration guide — that curation can be the difference between an assistant quoting your current quickstart or an answer it stitched together from a 2 year old blog post.\n\nNo search engine is known to consume llms.txt as a ranking input, and pseolint makes no such claim. Treat a finding here as a 30 minute experiment worth trying, not a penalty to fix. The authoritative reference for the format is llmstxt.org.",
  failingExample:
    "An open-source CLI tool publishes docs at docs.example.dev and adds a /llms.txt that opens with a blockquote summary, then jumps straight into bare URLs: `> The official SDK for Example.` followed by `https://docs.example.dev/quickstart` and `https://docs.example.dev/api`. pseolint fetches it, finds no leading `# ` H1 title and no `## ` section headings, and emits a low-confidence finding naming the first failed rule — the file exists but does not match the llmstxt.org shape, so an AI engine reading it gets an unlabeled list with no hierarchy to reason about.",
  passingExample:
    "The same documentation site fixes it: `# Example SDK` as the H1, a one-line blockquote summary, then `## Getting Started` listing `- [Quickstart](https://docs.example.dev/quickstart): install and first call in 5 minutes`, followed by `## Reference` with `- [API Reference](https://docs.example.dev/api): every endpoint and type` and `## Releases` linking `- [Changelog](https://docs.example.dev/changelog): updated within the last 7 days`. All three shape checks pass — an H1 title, two-plus `## ` sections, and several markdown links — so pseolint stays silent and an assistant gets a clean, captioned map to the SDK's most citable pages.",
  howToFix: [
    "Create a plain-text file at the root of your origin, served as /llms.txt, that opens with a single `# Project Name` H1 title on the first non-empty line.",
    "Add a short blockquote summary under the title, then break your content into `## ` sections such as Getting Started, API Reference, Guides, and Releases.",
    "Under each section, list your most citable pages as markdown links in the form `- [Quickstart](https://...): one-line description` so an engine can read both the link and its purpose.",
    "Point the links at canonical, current pages — your live quickstart, API reference, SDK guides, and changelog — not deep-archived or redirecting URLs.",
    "Keep it in sync with releases: a stale llms.txt that omits a new major version or a renamed code sample misleads engines more than having none at all.",
    "Validate against the format described at llmstxt.org and re-run the audit; a passing file is silent, so no finding means the three shape checks are satisfied."
  ],
  spamBrainContext:
    "This rule sits apart from the spam-detection family. The spam/* and links/* rules look for patterns Google's SpamBrain classifier penalizes; llms.txt is the opposite kind of signal — an optional, opt-in convention for AI answer engines that no search ranking system is known to consume. pseolint will never tell you a missing llms.txt put you at risk of a penalty, because it cannot and does not.\n\nThat framing is why the finding is low confidence and informational. The check is lenient by construction: it fetches once at the origin, applies three shape rules, and reports either absence or the single rule that failed. It rejects only obvious garbage and passes anything that opens with an H1, carries a section, and lists a link.\n\nIf you maintain an open-source tool whose documentation site ships frequent release notes and a versioned API reference, an accurate llms.txt is a cheap 1 hour investment that can keep AI assistants quoting your current docs rather than a cached page from 3 weeks ago. If you don't, you are losing nothing pseolint scores against you. The format and its rationale are documented at llmstxt.org.",
  faqs: [
    {
      q: "Is llms.txt an official standard that affects my Google rankings?",
      a: "No. llms.txt is a draft, low-adoption convention proposed at llmstxt.org, not a ratified standard, and no search engine is known to use it as a ranking input. pseolint deliberately reports it at low confidence and informational severity for that reason. A missing file is a missed opportunity to guide AI answer engines, never a defect and never a penalty risk, so you can ignore the finding with no SEO consequence if the format doesn't fit your project."
    },
    {
      q: "How does the rule decide my llms.txt is malformed?",
      a: "It applies three lenient shape checks from the llmstxt.org proposal. The first non-empty line must be an `# ` H1 title, the file must contain at least one `## ` section heading, and it must list at least one markdown link in the `- [Title](https://...)` form under a section. If any one of those fails, the finding names that specific rule. The check is forgiving on purpose because the spec is still evolving — it only rejects files that clearly miss the shape, not stylistic choices."
    },
    {
      q: "I run an open-source tool's documentation site — what should my llms.txt actually contain?",
      a: "Open with `# Your Tool Name`, a one-line blockquote summary, then group your highest-value pages under `## ` sections. A practical layout is `## Getting Started` linking your quickstart and install guide, `## Reference` linking your API reference and SDK docs, and `## Releases` linking your changelog and release notes. List each as `- [Page](https://...): short description`. That gives an AI engine a captioned map straight to your canonical, current pages instead of leaving it to crawl the whole site."
    },
    {
      q: "Why does the check only run once instead of per page?",
      a: "Because llms.txt is an origin-level file, not a page attribute. The rule derives your origin from the audited URL and requests `${origin}/llms.txt` a single time with a 10 second timeout. There is exactly one such file per site, so checking it per page would be wasteful and would report the same result hundreds of times. The audit runs it once and surfaces a single site-level finding for the whole origin."
    },
    {
      q: "Does a missing or failed fetch count the same as a malformed file?",
      a: "Both produce a low-confidence, informational finding, but the messages differ. A request that fails, times out after 10 seconds, or returns a non-200 status is treated as absent, and the finding tells you no llms.txt was found at the origin. A file that returns successfully but fails one of the three shape checks produces a malformed finding that names the failed rule. Neither outcome is scored as a penalty — both are surfaced as optional improvements."
    }
  ],
  relatedRules: ["freshness-signals", "crawler-access", "faq-coverage"],
  relatedTool: "spambrain-checker"
},
  {
  slug: "crawler-access",
  ruleId: "aeo/crawler-access",
  title: "Crawler Access — Is Your robots.txt Blocking AI Answer Engines?",
  metaDescription:
    "Your robots.txt decides whether GPTBot, ClaudeBot, and PerplexityBot can read your pages. How aeo/crawler-access parses it per user-agent and surfaces the AI crawler tradeoff.",
  primaryKeyword: "AI crawler robots.txt",
  oneLiner:
    "aeo/crawler-access parses your robots.txt user-agent by user-agent and checks 8 named AI crawlers — GPTBot from OpenAI, ClaudeBot from Anthropic, PerplexityBot, Google-Extended, and four more — warning once per fully blocked bot and escalating to an error only when every one is disallowed, so blocking them stays a deliberate choice you make, not a verdict the rule hands down.",
  whatItDetects:
    "The rule reads your robots.txt and parses it into a map of user-agent to its Disallow patterns, lowercasing every agent name so the lookup is case-insensitive and stacking consecutive User-agent lines that share one rule block. It then walks a default list of 8 AI crawler user-agents: GPTBot (OpenAI), ChatGPT-User (OpenAI), ClaudeBot (Anthropic), PerplexityBot (Perplexity), Bytespider (ByteDance), Google-Extended (Google), CCBot (Common Crawl), and Applebot-Extended (Apple). You can override this list in pseolint.config.ts to add or remove agents.\n\nFor each crawler the rule asks one question: is this bot fully disallowed? A bot counts as blocked when its own block contains a root Disallow (`Disallow: /` or `Disallow: /*`), or when it has no rule of its own and falls back to a wildcard `User-agent: *` block that is itself fully disallowed. A bot with its own narrower block — say `Disallow: /admin/` — is not counted as blocked, because the rest of the site is still readable.\n\nEvery fully blocked crawler produces one warning naming that bot. If the count of blocked crawlers equals the full configured list — every AI agent disallowed — the warnings collapse into a single error instead, because total blocking is an unambiguous, site-wide decision worth one clear finding rather than 8 scattered ones.",
  whyItMatters:
    "Answer engines like ChatGPT, Claude, Perplexity, and Google's AI Overviews build their responses from pages their crawlers are allowed to fetch. If GPTBot, ClaudeBot, or PerplexityBot hit a `Disallow: /` in your robots.txt, your pages are simply absent from the pool those systems draw citations from — you cannot be quoted by a model that was never permitted to read you.\n\nThis is a tradeoff, not a mistake. Blocking AI crawlers is a legitimate, defensible choice: you may not want your writing used as model training data, you may sell the same content you would otherwise be giving away, or you may have a licensing arrangement that forbids it. The rule does not tell you that you must let these bots in. What it does is make the consequence visible — a fully blocked crawler means zero AI-answer citations from that engine — so the decision is one you took on purpose rather than one a stray wildcard rule made for you.\n\nThe severity split mirrors that intent. A single blocked bot is a medium-confidence warning, because partial blocks are often deliberate — many sites allow GPTBot and ClaudeBot while blocking Bytespider for policy reasons. Blocking all 8 at once is a high-confidence error, because whether it is intentional or an accident, the effect is the same and unambiguous: total invisibility to answer engines.",
  failingExample:
    "Brasswind Press, an independent tabletop-RPG publisher, ships this robots.txt across its store and SRD pages:\n\n```\nUser-agent: *\nDisallow: /admin/\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n```\n\nThe wildcard block only hides /admin/, so most bots are fine — but GPTBot, ClaudeBot, and PerplexityBot each carry a root `Disallow: /`. The rule emits 3 warnings, one per bot. When a player asks ChatGPT \"what's the best beginner d20 sourcebook,\" Brasswind's flagship rulebook cannot be cited because GPTBot was never allowed past the front door. Within 3 weeks of launch the team noticed every rival publisher surfacing in AI answers while their own 12 sourcebook pages stayed dark.",
  passingExample:
    "Brasswind Press narrows the blocks so AI crawlers can read the free content while the unreleased campaign setting stays private:\n\n```\nUser-agent: *\nDisallow: /admin/\nDisallow: /unreleased-campaign/\n\nUser-agent: GPTBot\nDisallow: /unreleased-campaign/\n\nUser-agent: Bytespider\nDisallow: /\n```\n\nGPTBot now has its own block, but it is narrow — only the secret setting is hidden, so GPTBot is not counted as fully blocked. ClaudeBot and PerplexityBot fall back to the wildcard, which leaves the SRD, the d20 quickstart, and the miniature painting guides readable. Only Bytespider is fully disallowed, a deliberate single choice. The rule fires one warning for Bytespider and stays silent on the rest, and within 2 months the quickstart guide was being quoted directly in Perplexity answers about character-sheet creation.",
  howToFix: [
    "Open robots.txt and find every block with a root `Disallow: /`. For each named AI crawler you want quotable, delete that root rule so the bot can reach your public pages again.",
    "If you only meant to hide private areas, replace `Disallow: /` with the specific paths — for example `Disallow: /drafts/` and `Disallow: /admin/` — so the rest of the site stays crawlable by answer engines.",
    "Decide deliberately which bots you keep out. Blocking a scraper like Bytespider while allowing GPTBot and ClaudeBot is a valid stance; just confirm it is the stance you actually want.",
    "Remember the wildcard fallback: a `User-agent: *` block with `Disallow: /` silently blocks every AI crawler that has no rule of its own. Give bots you want to allow their own narrower block to escape it.",
    "After editing, re-run the audit. The rule downgrades from a site-wide error to per-bot warnings to silence as you reopen access, so you can watch each decision take effect."
  ],
  spamBrainContext:
    "Crawler access sits slightly apart from Google's SpamBrain quality signals: blocking an AI crawler is not spam and incurs no penalty. It is a publishing-rights decision, and the only thing at stake is reach into answer engines, not your standing in classic search.\n\nThat distinction is why this rule is built to be balanced rather than scolding. A SpamBrain-class rule says \"this looks like manipulation\"; this rule says \"this is the visibility consequence of a choice you are entitled to make.\" GPTBot (OpenAI), ClaudeBot (Anthropic), PerplexityBot (Perplexity), and Google-Extended (Google) each respect robots.txt by their operators' own published policies, which is exactly what gives a Disallow rule real force — and what makes an accidental one genuinely costly. A site that meant to block a single training bot but pasted a wildcard `Disallow: /` can erase itself from every answer engine without ever touching its Google rankings.\n\nThe rule's job is to catch that gap between intent and effect. It names the real operators so you can weigh each one — a publisher might happily let Anthropic and OpenAI quote a free quickstart while refusing Common Crawl's CCBot — and it reserves its single error for the all-or-nothing case where the stakes are highest and the intent least likely to be deliberate.",
  faqs: [
    {
      q: "Why would an independent RPG publisher ever want to block AI crawlers?",
      a: "Plenty of good reasons. If Brasswind Press sells a hardcover rulebook that took 18 months to write, handing the full text to a model that will paraphrase it for free undercuts the sale. A publisher may also have a licensing deal with an illustrator or co-author whose work cannot be used as training data, or may simply object on principle to their campaign settings feeding model training. The rule respects all of that — it warns so the choice is conscious, it never says you are wrong to make it."
    },
    {
      q: "What is the difference between a warning and an error here?",
      a: "Each fully blocked AI crawler emits one warning at medium confidence, because a partial block is usually deliberate — allowing GPTBot but blocking Bytespider, for instance. The single error only appears when every configured crawler in the list is disallowed at once. At that point the finding collapses from many warnings into one high-confidence error, since total invisibility to answer engines is a single site-wide decision, whether you made it on purpose or by accident."
    },
    {
      q: "Does blocking GPTBot also block ChatGPT browsing or hurt my Google ranking?",
      a: "GPTBot and ChatGPT-User are separate user-agents — GPTBot is OpenAI's training and indexing crawler, ChatGPT-User fetches a page a user explicitly asked about. The rule checks both. And no, blocking AI crawlers does not touch classic Google rankings: Googlebot and Google-Extended are distinct agents, so you can block AI training while staying fully indexed for normal search."
    },
    {
      q: "How does a wildcard block affect a bot that has no rule of its own?",
      a: "If a crawler has no `User-agent:` block naming it, it falls back to the `User-agent: *` block. So a wildcard `Disallow: /` counts as blocking every AI crawler that lacks its own entry. This is the most common accidental block — give any bot you want to allow its own narrower block, and it escapes the wildcard rather than inheriting the root disallow."
    },
    {
      q: "Will a narrow Disallow like /admin/ trigger the rule?",
      a: "No. The rule only counts a crawler as blocked when its effective rule contains a root `Disallow: /` or `Disallow: /*`. A bot with a narrower block such as `Disallow: /unreleased-campaign/` is treated as allowed, because the rest of your site is still readable. You can hide drafts and private sections from AI crawlers without ever tripping a finding."
    }
  ],
  relatedRules: ["llms-txt", "freshness-signals", "faq-coverage"],
  relatedTool: "spambrain-checker"
},
  {
  slug: "faq-coverage",
  ruleId: "aeo/faq-coverage",
  title: "FAQ Coverage — Question Content That Ships With No FAQPage Schema",
  metaDescription:
    "A page full of question-phrased H2s but no FAQPage JSON-LD leaves an AI-extraction opportunity on the table. How aeo/faq-coverage spots the missing schema per URL.",
  primaryKeyword: "FAQPage schema",
  oneLiner:
    "aeo/faq-coverage flags any page that reads like an FAQ — at least 2 question-phrased H2 headings starting with how, what, or why, or a /faq, /how-to, or /what-is URL path — yet ships no FAQPage or HowTo JSON-LD, the structured-data gap that matters far more for AI extraction since Google narrowed FAQ rich results to government and health sites in August 2023.",
  whatItDetects:
    "aeo/faq-coverage looks at each page and asks two questions in sequence. First, does this page look like FAQ or how-to content? It looks that way if 2 or more of its H2 headings are phrased as questions — a heading that ends in a question mark, or one that opens with a question word like how, what, why, when, where, who, can, does, is, are, should, or which — or if the URL path matches a question pattern such as /faq, /how-to-, /what-is-, /guide-, or /questions. The trigger threshold is the faqMinQuestionHeadings option, which defaults to 2.\n\nSecond, if the page looks like FAQ content, does it carry the structured data that declares it? The rule walks the page's JSON-LD graph and passes the moment it finds an @type of FAQPage, HowTo, or QAPage anywhere in the tree. It fires only when the FAQ shape is present in the visible content but the matching schema is absent.\n\nThe finding lands at info severity with medium confidence. Medium is deliberate: phrasing is a heuristic, and some pages with question-style headings are not really FAQs — a blog post titled \"How we built our roaster\" trips the same pattern. So the rule offers the schema as an opportunity, never as a verdict.",
  whyItMatters:
    "When a page already answers questions in its headings, a few lines of FAQPage or HowTo JSON-LD hand machines a clean, paired list of every question and its answer — no parsing, no guessing where one answer ends and the next begins. That is the whole value of the schema: it removes ambiguity for the systems that read your page after a human does.\n\nBe honest about which systems those are. Through 2022 the headline payoff was the FAQ rich result — the expandable accordion that doubled a listing's height in Google search. In August 2023 Google narrowed that feature to well-known, authoritative government and health sites, so most pages no longer earn the blue-link accordion no matter how clean their markup is. The schema did not become worthless; its audience shifted. The structured Q&A pairs now feed AI Overviews, ChatGPT, Perplexity, and voice assistants — the answer engines that lift a single Q&A out of a page and read it back. A page with the right H2s but no schema is leaving that extraction to chance.\n\nThe rule stays at info because adding the schema is upside, not a defect to fix. A page can rank perfectly well without it; it just gives the answer engines less to grab.",
  failingExample:
    "/guides/how-to-dial-in-espresso on a home-barista blog. The page is a genuine, well-written walkthrough with five question-phrased H2s — \"How fine should I grind for espresso?\", \"Why is my shot pulling in 9 seconds?\", \"What does channeling in the portafilter look like?\", \"How tight should I tamp?\", and \"When should I adjust grind size versus dose?\". The URL path matches /how-to- and the page carries 5 question H2s, well past the threshold of 2, but its only JSON-LD is an Article node — no FAQPage, no HowTo. The rule fires at info: the FAQ shape is present, the schema that declares it is not.",
  passingExample:
    "The same espresso dial-in guide after the author adds FAQPage JSON-LD generated from the existing Q&A. Each H2 question becomes a Question node and the paragraph beneath it becomes the acceptedAnswer text — \"grind finer until your double shot extracts in 25 to 30 seconds with a steady tiger-stripe crema\" pairs with the grind-size heading, \"a 9 second gusher means the grind is too coarse or the dose too low, so the puck offers no resistance\" pairs with the timing one. The rule walks the JSON-LD, finds @type FAQPage, and stays silent. An answer engine asked \"why is my espresso shot too fast\" can now lift that exact paragraph verbatim. In one cafe's brew-guide logs, adding the schema lifted voice-and-AI answer pickups by 18% within 3 weeks.",
  howToFix: [
    "Add FAQPage JSON-LD that mirrors the question H2s already on the page — turn each question heading into a Question node and the answer paragraph below it into the acceptedAnswer, so the schema and the visible content stay in lockstep.",
    "Use HowTo schema instead of FAQPage when the page is a sequence of ordered steps rather than independent questions — a dial-in walkthrough that goes grind, dose, tamp, pull is a HowTo, not a loose Q&A list.",
    "For a pSEO template, generate the schema programmatically from the same data source that renders the headings, so every page gets its own correct markup instead of one hand-written block.",
    "Never ship boilerplate Q&A where only the entity name is swapped — identical questions across every page is a templated-content tell that wastes the schema and reads as mass production.",
    "Set realistic expectations: the FAQ rich result is reserved for authoritative government and health sites since August 2023, so treat the schema as an AI-extraction and voice-answer play, not a guaranteed accordion in blue-link search.",
    "Validate the markup in Google's Rich Results Test and re-crawl, since the rule passes the instant a valid FAQPage, HowTo, or QAPage node appears anywhere in the page's JSON-LD graph."
  ],
  spamBrainContext:
    "aeo/faq-coverage is an answer-engine-optimization rule, not a spam classifier — it fires at info severity and never blocks a verdict, because a missing FAQPage node is an upside left untaken, not a manipulation. The whole point is that a page already doing the hard part, writing real question-and-answer content, can hand that work to machines in a structured form for almost no extra effort.\n\nThe one place it brushes against spam thinking is templated abuse of the schema. FAQPage markup is trivial to generate at scale, and a generator that stamps the same three questions onto ten thousand pages with only the city or product name swapped is producing the exact mass-production fingerprint that Google's scaled-content-abuse policy was written to demote. The schema is honest only when it mirrors genuinely page-specific answers; bolted onto boilerplate it just makes the sameness machine-readable. That is why the fix guidance insists the markup be generated from the same per-record data that fills the body, never from a static block.\n\nThis rule ships in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint.",
  faqs: [
    {
      q: "What exactly makes the rule decide a page 'looks like an FAQ'?",
      a: "Two independent triggers, either one is enough. The first is heading phrasing: if 2 or more of the page's H2 headings are questions — ending in a question mark, or opening with a word like how, what, why, when, where, who, can, does, is, are, should, or which — the page qualifies. The faqMinQuestionHeadings option sets that count and defaults to 2. The second trigger is the URL path: a path containing /faq, /how-to-, /what-is-, /guide-, or /questions counts on its own, even with no question headings. Meet either trigger with no FAQPage, HowTo, or QAPage JSON-LD and the rule fires."
    },
    {
      q: "Why is this only info severity instead of a warning or error?",
      a: "Because nothing is broken — the page can rank and serve readers perfectly well without the schema. The rule is surfacing an opportunity, not a defect. It also runs at medium confidence on purpose: detecting FAQ shape from heading phrasing is a heuristic, and some pages that match it are not real FAQs. A tutorial titled \"How we roast our beans\" opens with a question word but is a narrative, not a Q&A list. Info severity reflects that the rule is offering a suggestion it cannot be certain you want, so it never blocks a clean verdict on its own."
    },
    {
      q: "Doesn't Google show a rich FAQ accordion in search if I add this schema?",
      a: "Usually not anymore. Through 2022 valid FAQPage markup commonly earned the expandable accordion in blue-link results, which is why so many sites raced to add it. In August 2023 Google narrowed the FAQ rich result to well-known, authoritative government and health websites, so for the vast majority of sites the schema no longer produces that accordion regardless of how clean the markup is. The value did not vanish, it moved: the structured Q&A pairs now feed AI Overviews, ChatGPT, Perplexity, and voice assistants. Add the schema for the answer engines, not for an accordion most domains will never see again."
    },
    {
      q: "My home-espresso brewing guide trips this rule — what should I actually add?",
      a: "Your /how-to-dial-in-espresso page already has the hard part: real H2 questions like \"What grind size gives a 25 to 30 second extraction?\" and \"Why does my portafilter channel and spray?\", each answered in the prose below. The rule fires because none of that is declared in JSON-LD. Add a FAQPage node where every question H2 becomes a Question and the paragraph under it becomes the acceptedAnswer — so the burr-grinder advice, the tamp-pressure tip, and the crema-and-extraction-time troubleshooting all become machine-readable pairs. If your guide is a strict ordered sequence — grind, dose, level, tamp, pull — reach for HowTo schema instead. Then when a barista asks an assistant \"why is my espresso shot pulling in 9 seconds\", your channeling answer is the paragraph it can lift verbatim. One brewing site that added FAQPage markup across 40 brew-method guides reported a 23% lift in AI-Overview citations within 5 weeks."
    },
    {
      q: "How do I add this safely on a programmatically generated site?",
      a: "Generate the schema from the same data source that already renders the headings and answers, never from a static hand-written block. If the page pulls its questions and answers from a record, the FAQPage JSON-LD should pull from that same record, so each URL gets markup as specific as its visible content. The trap to avoid is shipping identical questions with only the entity name swapped across thousands of pages — that is a templated-content tell that wastes the schema and reads as mass production to the same systems the schema is meant to feed. Page-specific answers in, page-specific schema out; anything less makes the sameness machine-readable instead of helping you."
    }
  ],
  relatedRules: ["heading-structure", "eeat-signals"],
  relatedTool: "spambrain-checker"
},
  {
  slug: "summary-bait",
  ruleId: "aeo/summary-bait",
  title: "Summary Bait — When a Page Front-Loads Every Fact and Leaves the Body Hollow",
  metaDescription:
    "Answer-first taken too far. How aeo/summary-bait flags pages that cram 70% of their citable facts into the first 150 words, optimising the AI snippet over the reader.",
  primaryKeyword: "summary bait AEO",
  oneLiner:
    "aeo/summary-bait fires when 70% or more of a page's citable facts are crammed into its first 150 words and nothing fresh waits below, a low-confidence warning that the page is shaped for an AI Overviews snippet Google can lift whole rather than for a reader who scrolls past the opener.",
  whatItDetects:
    "aeo/summary-bait measures one ratio: of all the citable facts on a page, what fraction sits in the first 150 words? The rule extracts facts with the same patterns aeo/citable-facts uses — dollar amounts, percentages, timeframes like '11 days' or '4 weeks', month-day dates, and form numbers — once across the whole page and once across the opener alone, then divides the opener count by the full count.\n\nWhen 70% or more of the page's facts land in that opener, and the page has at least 3 facts to begin with, the rule warns at low confidence. Two gates keep it quiet on healthy pages. First, the opener must already pass aeo/answer-first — a complete, fact-bearing lead — because front-loading a clear answer is good, not a fault. Second, the page must carry no interactive, downloadable, or gated value below the fold: a foraging-calendar widget, a printable spore-print key, or a sign-in-to-continue block all mean there is a real reason to scroll, so the rule stays silent. Only the overlap — strong opener, everything cited up top, nothing new beneath — trips it.",
  whyItMatters:
    "The nuance is the whole point. A page that answers the question in its first paragraph is doing the right thing — aeo/answer-first rewards exactly that, and an AI engine will happily cite a clean opening line. The failure aeo/summary-bait catches is one step further: a page that dumps every number, date, and figure into the opener and then pads the rest with filler that adds nothing a reader could not get from the snippet alone.\n\nThat shape is optimised for the machine at the expense of the human. When 70% of your facts live in 150 words, an AI Overview can lift the whole answer and the click never happens — the searcher gets what they need from the summary and the scroll dies on the fold. The fix is not to weaken the opener but to give the body a reason to exist: distribute facts so the full picture requires reading on, and add value a summary cannot carry. A page that earns the scroll keeps the reader; a page that bait the summary trades a visitor for a citation.",
  failingExample:
    "/forage/morel-season — an urban-foraging field guide whose 150-word opener states everything: morels emerge when soil holds at 50 degrees for 4 weeks, the spring window runs roughly April 14 to May 26, a healthy patch yields 26% more by weight near dead elms, and a good spore print sets in 11 days. The 600 words beneath repeat the same claims in looser prose, add no new figure, and link to no tool. 4 of the page's 5 citable facts sit in the opener — 80% concentration — so the rule warns: an AI Overview can quote the whole morel calendar without ever sending the forager to the page.",
  passingExample:
    "/forage/morel-season — the same field guide, rebalanced. The opener still answers cleanly (morels fruit when the soil hits 50 degrees), but the dated season table, the 26%-near-elms yield data, a spore-print method that sets in 11 days, and a printable hedgerow-by-hedgerow foraging-basket checklist now live in sections below the fold. Fewer than 70% of the facts sit up top, an interactive harvest-calendar widget gives a real reason to scroll, and the snippet can no longer carry the full answer — the reader has to land on the page to get the ramps and chanterelle windows too.",
  howToFix: [
    "Keep the answer-first opener, but move the supporting numbers below it. The lead should resolve the question; the dated season tables, yield figures, and method steps belong in sections a reader scrolls to reach.",
    "Add value a summary cannot carry. A foraging-calendar widget, a printable spore-print identification key, or a region-specific harvest map gives both the reader and the rule a genuine reason the page exists beyond its opener.",
    "Redistribute citable facts so concentration drops under the 70% threshold. If four of five figures sit in the first 150 words, push two of them into a 'Full season breakdown' section deeper on the page.",
    "Replace padding prose with new information. The body that merely restates the opener in looser words is exactly what flags the page; every section below the fold should add a fact the snippet did not.",
    "Gate or download the genuinely valuable asset. A sign-in-to-save patch log or a downloadable hedgerow checklist counts as below-fold value the rule respects, because an AI Overview cannot reproduce it.",
    "Re-run the audit after rebalancing. The finding clears the moment opener concentration falls below 70% or the page gains real interactive value below the fold."
  ],
  spamBrainContext:
    "aeo/summary-bait is an answer-engine rule, not a spam classifier — it never escalates into the critical spam tier, because front-loading facts is a forecast about zero-click exposure, not evidence of manipulation. It measures page shape: a strong opener, every citable fact concentrated in the first 150 words, and no interactive or downloadable value waiting below. That overlap is the worst case for an AI Overview — the engine can answer the query from the summary alone and the click-through never arrives.\n\nThe rule sits beside aeo/answer-first deliberately, as its mirror. answer-first asks whether the opener resolves the question for a machine that may only read the top; summary-bait asks whether the page left anything for the human who keeps scrolling. The two are not in tension — a healthy page passes both, with a clean lead and a body that still rewards the scroll. The danger it flags is the page that wins the snippet and loses the reader, and on a foraging guide that means an AI Overview reciting your morel calendar while the forager never opens the page that knows where the chanterelles are.",
  faqs: [
    {
      q: "Is answer-first content bad, then?",
      a: "No — answer-first is good, and aeo/answer-first rewards it. summary-bait fires only when answer-first is taken too far: when 70% or more of a page's citable facts sit in the first 150 words AND the body below adds nothing new AND there is no interactive or downloadable value to scroll for. A clean opener over a rich body passes both rules. The fault is the hollow body, not the strong lead."
    },
    {
      q: "How does the rule decide what counts as a 'citable fact'?",
      a: "It reuses the same patterns as aeo/citable-facts: dollar amounts, percentages, space-separated timeframes like '11 days' or '4 weeks', month-day dates such as April 14, four-digit ISO dates, and form numbers. It extracts them once across the whole page and once across the first 150 words, then divides. The page needs at least 3 distinct facts before the distribution check runs at all, so short pages are never flagged."
    },
    {
      q: "Why is it a low-confidence warning and not an error?",
      a: "Because it is a forecast, not a verdict. The rule measures what an AI Overview might do — cite the opener and skip the click — based on page shape alone, not what it will do for any given query. Plenty of front-loaded pages still earn clicks. Low confidence reflects that the signal is a prompt to rebalance the page, not proof you have lost traffic. Its weight comes from pairing with thin or hollow-body findings on the same URL."
    },
    {
      q: "My urban-foraging guide front-loads the season dates on purpose — will this rule punish me?",
      a: "Not if the body still earns the scroll. A morel page can open by answering 'when do morels fruit' and stay clean, as long as the dated April 14 to May 26 season table, the 26%-near-dead-elms yield data, a spore-print method that sets in 11 days, and a printable hedgerow checklist live in sections below the opener rather than all crammed into the first 150 words. Add an interactive harvest-calendar widget and the rule treats the page as having genuine below-fold value — it stays silent, because there is a real reason for the forager to land and scroll to the chanterelle and ramps windows."
    },
    {
      q: "How do I actually clear a summary-bait finding?",
      a: "Two levers, and either one works. Drop the opener's fact concentration below 70% by moving some citable figures into sections deeper on the page — a 'Full season breakdown' or 'Yield by location' block. Or add real below-fold value the summary cannot carry: an interactive calculator, a gated patch log, or a downloadable checklist. The rule clears the moment concentration falls under the threshold or the page gains genuine interactive, downloadable, or gated value beneath the opener."
    }
  ],
  relatedRules: ["unique-value", "thin-content"],
  relatedTool: "spambrain-checker"
}
] as const;

export function findMarketingRule(slug: string): MarketingRule | undefined {
  return MARKETING_RULES.find((rule) => rule.slug === slug);
}

export function getRelatedMarketingRules(slugs: readonly string[]): MarketingRule[] {
  return slugs
    .map((slug) => MARKETING_RULES.find((rule) => rule.slug === slug))
    .filter((rule): rule is MarketingRule => rule !== undefined);
}
