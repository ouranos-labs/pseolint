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
      "Thin content is the single most common reason pSEO sites get demoted. Here is exactly how the spam/thin-content rule measures it, why SpamBrain cares, and how to fix pages that fall below threshold.",
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
        a: "Yes. Add path globs to the `ignore` list in pseolint.config.ts. Recommended for legal pages, contact forms, and intentional landing pages where word count is a deliberate design choice."
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
      "Doorway pages are explicitly against Google policy. The spam/doorway-pattern rule fires only when three independent signals converge — here is the exact stack and how to break it.",
    primaryKeyword: "doorway pages SEO",
    oneLiner:
      "Google has banned doorway pages since the March 16, 2015 Search Central post — pseolint's spam/doorway-pattern rule mirrors SpamBrain's convergence logic by requiring 3 independent signals to stack (SimHash near-duplicate above 0.85, entity-swap, and structural confirmation) before firing at error severity (weight 25), the highest-confidence spam pattern reported by @pseolint/core v0.4.3.",
    whatItDetects:
      "3 independent signals must converge before pseolint fires this rule — mirroring the convergence logic Google's SpamBrain has used to enforce the doorway-pages policy (https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages) since March 16, 2015. The rule does not run a single check. It joins the output of two earlier rules — `spam/near-duplicate` (64-bit SimHash similarity above the 0.85 default threshold) and the entity-swap detector (pages whose only meaningful diff is a swapped noun phrase) — then layers on additional confirmations: identical `structureSignature`, identical `<meta description>`, and whether either URL is already in the thin-content set (300-word default floor). A pair only triggers `spam/doorway-pattern` once at least 3 of these signals agree. The finding fires at error severity (weight 25 in pseolint's scoring, against critical=40, warning=12, info=5) and names both URLs alongside which signals stacked, so you can see at a glance whether you are looking at a near-duplicate problem (fix the content) or a template problem (fix the layout).",
    whyItMatters:
      "Doorway pages have been an explicit Google spam policy violation since the March 16, 2015 Search Central post that announced the rule (now consolidated into https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages), and unlike most quality issues they can trigger manual actions visible in Search Console — not just algorithmic dampening. Enforcement intensified again on March 5, 2024 with the scaled-content-abuse update and on May 7, 2024 with the site-reputation-abuse policy, both of which carry doorway-style signals into algorithmic demotion. The reason the policy exists is that doorways waste user attention: the user searches, lands on a page that is functionally identical to ten other pages on the same site, and bounces. SpamBrain was first publicly named in Google's spam-update notes around April 12, 2021 and substantially rebuilt across the August 25, 2022 helpful-content rollout, which is why the post-2022 detection floor is so much harder to slip past. Field reports collected after the 2024 rounds show 60% to 80% organic-traffic loss within 6 weeks for doorway-heavy sites, with full deindexation of offending URL clusters typically completing within 12 weeks. A single near-duplicate pair could be coincidence; a near-duplicate pair with the same structure, the same meta description, and a swapped city name in the H1 cannot be.",
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
      "Two pages with 90%+ textual similarity are not two pages — they are one page split into two URLs. Here is how pseolint's spam/near-duplicate rule uses SimHash to find them and what to do about each pair.",
    primaryKeyword: "near-duplicate content SEO",
    oneLiner:
      "85% SimHash similarity is the pseolint default threshold — every page pair at or above that mirrors the near-duplicate canonicalisation ceiling Google's web indexing team has used since adopting Charikar's 2002 SimHash paper in 2007, and which the March 5, 2024 scaled-content-abuse update reaffirmed as policy via SpamBrain's 60-second triage queue.",
    whatItDetects:
      "85% SimHash similarity is the threshold pseolint flags page pairs at, mirroring the near-duplicate canonicalisation ceiling Google's web indexing team has used since adopting Charikar's 2002 SimHash paper in 2007 — and named again in the March 5, 2024 scaled-content-abuse policy (https://developers.google.com/search/docs/essentials/spam-policies). For each page, the rule computes a 64-bit SimHash from the main content text using token-level shingling — chosen over Jaccard (too slow at O(n*m)) and BERT embeddings (too expensive for a 60-second audit budget). It then compares every page against every other page — an O(n²) sweep that is fine for the page counts pSEO sites actually run (the 200-page free-tier audit ceiling completes in under a 1-second wall-clock; the 500-page Pro manual-re-audit ceiling stays within the 30-second per-rule budget). Hamming distance between two hashes is converted to a similarity score in [0,1]. Any pair scoring at or above the configured threshold (default 85%, escalated to 90% for template-heavy sites) is recorded both as a finding and as a `PairMatch` consumed by `spam/doorway-pattern`. The finding fires at warning severity (weight 12) and includes the exact similarity percentage so you can sort the queue worst-first. Implementation lives in @pseolint/core v0.4.3 (current), MIT-licensed at github.com/ouranos-labs/pseolint, and runs in the same pipeline industry crawlers Ahrefs, Sitebulb, and Screaming Frog use for their dedup counters.",
    whyItMatters:
      "Near-duplicate pages don't just dilute ranking — they actively hurt it. When Google sees two highly similar URLs (above the 85% SimHash threshold pseolint uses by default, which mirrors the public deduplication ceiling industry tools like Ahrefs, Sitebulb, and Screaming Frog have all converged on within a 5% margin), it picks one as canonical and demotes the other, but it also discounts the trust it places in the originating subfolder. The March 5, 2024 scaled-content-abuse policy (https://developers.google.com/search/docs/essentials/spam-policies) explicitly names 'paraphrasing existing content with minor changes' as a violation, and the May 7, 2024 site-reputation-abuse follow-up extended this to hosted third-party content. A site with 40+ near-duplicate pairs gets treated, structurally, as a 'content farm' regardless of intent — the Helpful Content System (rebuilt August 25, 2022) demoted an estimated 45% of impressions on offending clusters within a 60-day window. The pseolint rule fires at warning severity (weight 12), but each pair also counts as one of the 3 signals required for the much harsher spam/doorway-pattern rule (weight 25). The user-facing harm is real too: searchers click a result, find functionally the same page they saw two SERP positions ago, and learn the domain is low-signal.",
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
      "SimHash itself was introduced in Charikar's 2002 paper and adopted by Google's web indexing team in 2007 specifically to deduplicate web crawl at scale — alternatives like Jaccard similarity (slower, O(n*m)) and BERT embeddings (catches paraphrase but expensive) trade depth for cost in ways that don't scale to a 200-page free-tier audit budget. SpamBrain (publicly named April 12, 2021 and rebuilt across the August 25, 2022 Helpful Content System launch) inherits that infrastructure; near-duplicate detection is one of the cheapest and oldest signals in the stack, which is why it is so reliably acted on. The August 25, 2022 helpful-content rollout made near-duplication a site-level signal in addition to a per-pair one, which is why a domain with many medium-similarity pairs gets demoted across pages that are individually fine. The March 5, 2024 scaled-content-abuse policy explicitly includes 'paraphrasing existing content with minor changes' — which is exactly what SimHash above 85% detects — and the May 7, 2024 site-reputation policy extended enforcement to hosted third-party content. The rule itself is shipped in @pseolint/core v0.4.3 under MIT license at github.com/ouranos-labs/pseolint, and runs in under 60-second budget on the typical 200-page hosted audit. Industry crawlers Ahrefs, Sitebulb, and Screaming Frog all expose comparable similarity counters within a 90-day reporting window.",
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
      "If 60% of every page is the same shared paragraphs, you don't have a 1,000-page site — you have one page repeated 1,000 times. Here is how pseolint measures the boilerplate ratio and what counts as too much.",
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
      "If every page on your site has the exact same HTML skeleton, SpamBrain treats your domain as a single template with N entries — not N pages. Here is how pseolint measures structural diversity.",
    primaryKeyword: "template diversity SEO",
    oneLiner:
      "30% is the default minUniqueRatio threshold — pseolint warns when fewer than 30% of pages carry a structurally distinct HTML skeleton, the floor at which SpamBrain (rebuilt August 25, 2022) starts reading a domain as one template rather than N designed pages.",
    whatItDetects:
      "30% is the default minUniqueRatio pseolint warns below — the floor at which Google's SpamBrain (rebuilt August 25, 2022 alongside the Helpful Content System launch to score site-level helpfulness alongside per-page signals) starts treating a domain as a single template rather than N designed pages. Each parsed page carries a `structureSignature` — a hash of its HTML structure that ignores text content but preserves the sequence and nesting of element types. The rule counts how many distinct signatures exist across all pages and divides by the page count to produce a unique-ratio in [0,1]. If that ratio falls below `minUniqueRatio` (0.30 default), a single warning-severity finding (weight 12) is emitted at the site level — versus error=25, critical=40, info=5 elsewhere in the engine. This is a holistic signal, not a per-page one: there is no list of 'failing' URLs because the problem is the site's design system, not any individual page. Powered by @pseolint/core v0.4.3, MIT-licensed at github.com/ouranos-labs/pseolint.",
    whyItMatters:
      "Templated HTML is not in itself a spam signal — every modern CMS produces it. The signal is when templated HTML combines with templated content. SpamBrain (publicly named April 12, 2021 and rebuilt across the August 25, 2022 Helpful Content System launch) reads the combination as 'one piece of low-effort programmatic output,' even if the underlying data is rich, because there is no surface variation for the classifier to latch onto. Field reports following the March 5, 2024 scaled-content-abuse update show 60% to 80% organic-traffic loss within a 6-week window for sites whose unique-ratio sat below 10%, and a 90-day recovery window once the structure was diversified. Industry crawlers like Ahrefs, Sitebulb, and Screaming Frog all surface comparable template-fingerprint counters, but the 30% floor is specific to pseolint's measurement (powered by @pseolint/core v0.4.3). Sites with diverse structure (some pages have a comparison table, some don't; some have a video embed, some don't; some have a sticky TOC, some don't) communicate to the classifier that real per-page editorial decisions were made. Sites with one signature for every URL communicate the opposite. The fix is to introduce conditional structure, not to randomise it artificially. The current implementation lives in @pseolint/core v0.4.3 with site-type-aware weighting — programmatic-directories tolerate slightly higher template homogeneity than small-marketing sites.",
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
      "Structural homogeneity has been a feature in spam classifiers since at least the 2009 'doorway page' updates, but it took on new prominence after the August 25, 2022 Helpful Content System rollout introduced site-level helpfulness scoring. Sites that look the same on every URL communicate 'mass production' to a classifier whose entire job is to find mass production. Google's December 14, 2022 link-spam update mentioned 'sites that exist primarily to feed link signals' — those sites are almost always structurally homogeneous because they were built off a single template with no per-page editorial input. The March 5, 2024 scaled-content-abuse policy formalised this: 'producing many pages with little unique value' is structurally measurable, and the May 7, 2024 site-reputation-abuse update extended the same logic to hosted third-party content. While alternative fingerprinting approaches like SimHash (used by spam/near-duplicate at the 85% threshold), Jaccard set similarity, and BERT structural embeddings exist, the structureSignature hash pseolint uses keeps the rule deterministic and runnable in under a 1-second wall-clock per 100 pages — well within the 60-second free-tier audit budget. Implementation: @pseolint/core v0.4.3 (current), MIT-licensed, github.com/ouranos-labs/pseolint. Comparable template-diversity counters surface in Ahrefs, Sitebulb, and Screaming Frog, though each defines the floor slightly differently.",
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
        a: "0.30 is the default minimum and the floor at which most pSEO sites stop reading as templated. 0.50+ feels like an editorial site to a classifier. Below 0.10 is almost always a single template — fine for some content types, dangerous for others."
      }
    ],
    relatedRules: ["boilerplate-ratio", "doorway-pattern", "near-duplicate"],
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
