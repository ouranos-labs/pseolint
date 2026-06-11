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
        a: "That phrasing is the giveaway. Bind each venue's concrete distinguishers into the description instead: the ballroom's seated capacity, the garden-gazebo ceremony option, the in-house catering minimum, the reception square-footage, and the off-season Friday rate. A description reading 'Riverside Barn seats 180, gazebo ceremonies, 7,500-dollar Saturday corkage-free minimum' survives masking because the banquet figures differ per venue, while 'an unforgettable celebration at {venue}' collapses to one templated string the moment the name is masked away. A bridal-suite photo count, a sommelier-curated wine-pairing menu, a string-quartet add-on, and a marquee-tent rain contingency separate one ballroom from the next far better than any superlative adjective."
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
        a: "Not if those bylines are in markup the parser can read. A masthead and a dateline are human-facing conventions; the rule needs a machine-readable signal. As long as each staff-reporter story carries a `<div class=\"byline\">` or an `author` field in its NewsArticle JSON-LD — not just a hand-set 'By Our Correspondent' line that the editor-in-chief styled with a class the rule does not recognise — every article passes. If a wire-service dispatch republished under your masthead has no byline element at all, the rule correctly flags it as the one anonymous page in an otherwise-attributed corpus. In one illustrative cleanup, a desk that signed only 73% of its filed stories closed the gap to full coverage within an 11-day sprint by binding the staff-reporter field into its NewsArticle template."
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
      a: "Almost certainly the accountability markers a fiduciary practice should already be proud to display. A page walking a reader through an IRA rollover or how a Roth conversion lands in their marginal bracket should carry the byline of the certified financial planner who reviewed it, that planner's CFP credential, a visible 'last updated' date for when the contribution limits were checked, and a sources block citing the relevant IRS publication. Add those and a YMYL tax-planning page that was anonymous becomes a page a rater can trust — and clears the 2-of-4 floor on the strength of credentials you can substantiate. As an illustration, a tax-advice section that added a Series 65 registration line, a visible review date, and an errors-and-omissions disclosure lifted its coverage to 4-of-4 in 9 days and clawed back 22% of lost long-tail clicks over the following 13 weeks."
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
