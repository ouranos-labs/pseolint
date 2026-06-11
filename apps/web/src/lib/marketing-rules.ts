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
        a: "Not on its own. A ski resort that publishes one page per lift-ticket tier — beginner gondola passes, midweek chairlift bundles, full-mountain season passes — differentiates on genuine product attributes a snowboarder actually compares: snowpack depth, summit elevation, the count of groomed runs, night-skiing hours. It becomes a doorway only when those tiers collapse into near-identical prose with a swapped altitude figure and all funnel to one checkout. The three-signal stack measures whether the mountain-specific detail is real or cosmetic."
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
        a: "0.30 is the default minimum and the floor at which most pSEO sites stop reading as templated. 0.50+ feels like an editorial site to a classifier. Below 0.10 is almost always a single template — fine for some content types, dangerous for others."
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
        a: "Only if your clinic pages are interchangeable. A genuine veterinary group differentiates each location on its on-site surgical suite, its emergency feline-and-canine triage hours, its boarding-kennel capacity, and the named vets who practise there. Mask the town and those pages still diverge, so the entity-swap pair never assembles. If masking leaves identical vaccination-schedule boilerplate behind, the rule is correctly telling you the locations exist only on paper."
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
        a: "Only if you have no real dates to show. The rule skips pages with no detectable date, so stripping dates does silence it — but it also throws away a freshness and trust signal that helps elsewhere. The better move is to expose accurate dates that happen to be well distributed, which satisfies this rule and the aeo/freshness-signals rule at the same time."
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
        a: "The glossary does not, but the instrument's own numbers do. A refractor page stating its 102-millimetre aperture, its 660-millimetre focal length, the supplied 25-millimetre eyepiece, and the dovetail mount it ships on carries vocabulary no sibling listing repeats. A computerised go-to altazimuth mount and a manual equatorial tripod differentiate two products that would otherwise read alike. Move the shared 'what is magnification' explainer to one reference URL, and each telescope's distinct aperture, focal ratio, and eyepiece kit becomes the page-unique substance the rule counts."
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
        a: "That phrasing is the giveaway. Bind each venue's concrete distinguishers into the description instead: the ballroom's seated capacity, the garden-gazebo ceremony option, the in-house catering minimum, the reception square-footage, and the off-season Friday rate. A description reading 'Riverside Barn seats 180, gazebo ceremonies, 7,500-dollar Saturday corkage-free minimum' survives masking because the banquet figures differ per venue, while 'an unforgettable celebration at {venue}' collapses to one templated string the moment the name is masked away."
      }
    ],
    relatedRules: ["near-duplicate", "thin-content", "boilerplate-ratio"],
    relatedTool: "thin-content-scanner"
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
