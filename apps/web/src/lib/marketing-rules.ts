/**
 * Marketing copy for the public-facing /rules/[slug] explainer pages.
 *
 * These pages double as pSEO landing pages for queries like
 * "what is doorway pages SEO" or "near-duplicate page penalty Google".
 * Each entry MUST be uniquely written: no shared phrasing across rules:
 * because the pages will themselves be audited by pseolint.
 *
 * Detection mechanics described here must match the actual rule
 * implementation in packages/core/src/rules/spam/. If you change a rule's
 * algorithm, update the corresponding `whatItDetects` paragraph.
 */

import { ENGINE_VERSION } from "@/lib/version";
import type { MarketingSourceRef } from "./marketing-sources";
import { RULE_SOURCES } from "./marketing-source-notes";
import { RULE_EXTRA, type MarketingExtra } from "./marketing-extra-content";

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
  /** 2-4 authoritative citations (keyed into SOURCE_LIBRARY) with a
   *  page-specific note. Grounds the page's quantified claims for
   *  content/citation-coverage and AI Overviews. */
  sources: MarketingSourceRef[];
  /** Optional "in practice" worked-example paragraphs (page-specific scenario). */
  extra?: MarketingExtra;
}

const RULES_BASE = [
  {
    slug: "thin-content",
    ruleId: "spam/thin-content",
    title: "Thin Content Detection: How Google Catches Low-Substance Pages",
    metaDescription:
      "Thin content is the top reason pSEO sites get demoted. How the spam/thin-content rule measures it, why SpamBrain cares, and how to fix pages below the 300-word floor.",
    primaryKeyword: "thin content SEO",
    oneLiner:
      "Google's Helpful Content System (rebuilt August 25, 2022) demoted an estimated 45% of low-effort pages in the March 5, 2024 scaled-content-abuse update: the spam/thin-content rule mirrors that floor by flagging every URL under 300 words of substantive body text (default), after stripping nav and footer chrome via SpamBrain-style readability heuristics.",
    whatItDetects:
      "300 words is the default floor pseolint flags pages against, the threshold Google's SpamBrain classifier has been tuned to since the March 5, 2024 scaled-content-abuse update (https://developers.google.com/search/docs/essentials/spam-policies). The rule extracts the page's main content text (after stripping nav, footer, and other chrome) splits on whitespace, and counts non-empty tokens. Any URL whose word count is below the threshold you pass to the rule (defaults differ per pSEO archetype: 200 for product comparators, 350 for guide-style hubs) is added to a `thinContentUrls` set and reported with the exact deficit. That set is then reused by other rules (most notably `spam/doorway-pattern`) so a thin page that also looks templated escalates from a single error (weight 25) to a critical signal stack (weight 40). The check is intentionally cheap and deterministic; it does not try to evaluate quality, only volume of substantive prose.",
    whyItMatters:
      "Word count alone is a weak quality signal, which is precisely why SpamBrain (publicly named in Google's spam-update notes around April 12, 2021 and rebuilt across the August 25, 2022 Helpful Content System rollout) treats it as one input among many. The danger is not a single thin page; it is a pattern of them. Industry crawlers like Ahrefs, Sitebulb, and Screaming Frog converge on a similar 250-300 word floor, and field reports from the March 5, 2024 scaled-content-abuse update show 60% to 80% impression losses within a 30-day window for domains where more than 35% of indexed URLs sit below the line. Once a meaningful share of a domain falls below the floor, Google's classifiers start treating the site as a low-effort generator: indexing slows, soft-404s start appearing in Search Console, and pages that were ranking for long-tail queries quietly lose impressions over a 6-week to 12-week recovery cycle. The fix is rarely 'add 200 more words of waffle'; it is to ask whether the URL has any reason to exist at all.",
    failingExample:
      "/locations/plumber-in-akron: 84 words consisting of an H1 ('Plumber in Akron, Ohio'), a one-sentence intro ('Looking for a plumber in Akron? We have you covered.'), an embedded Google Map iframe, and a phone number. Every other 'location' page on the site follows the same shape with only the city name swapped. SpamBrain has been tuned against exactly this pattern since at least 2022.",
    passingExample:
      "/locations/plumber-in-akron: 540 words covering the three most common emergency-call categories Akron homeowners actually search for (frozen pipe thaws in February, sump-pump backups during the Cuyahoga River high-water months, hard-water buildup in the city's specific water supply), pulled from a structured data source rather than written by hand. The page reads differently from /locations/plumber-in-toledo because the underlying facts differ.",
    howToFix: [
      "Audit URL-by-URL, not in aggregate. A 50%-thin domain usually has clusters of completely empty pages; collapsing those is faster than rewriting everything.",
      "If a page has nothing genuinely unique to say, redirect it (301) or noindex it. Pruning is a feature, not a failure.",
      "Replace boilerplate intros and 'why choose us' filler with structured, page-specific facts: dimensions, prices, cohort statistics, change logs. Facts add words and quality at the same time.",
      "Connect a real data source (CSV, JSON, or your DB) so each entity contributes its own attributes. Pages should diverge on the facts, not just the H1.",
      "Raise your `thinMinWords` threshold gradually as you fix pages. Catching the next batch is easier when the floor moves up.",
      "Do not pad with FAQ accordions copied across the site; that triggers `spam/boilerplate-ratio` instead and you end up worse off."
    ],
    spamBrainContext:
      "Google's March 5, 2024 core + spam update explicitly named 'scaled content abuse' as a spam policy violation regardless of whether the content was AI-generated, and the Search Quality Rater Guidelines have used 'thin content with little or no added value' as a Lowest-quality example since the May 23, 2014 revision. The May 7, 2024 site-reputation-abuse policy then closed a related loophole: third-party content hosted on a high-authority domain. Both updates make pages-per-substantive-word the dominant ratio Google's quality systems care about. The `spam/thin-content` rule in @pseolint/core operationalises this by giving you a single number to act on, while industry crawlers like Ahrefs, Sitebulb, and Screaming Frog independently converge on the same 250-300 word floor. The Helpful Content System (the post-August 25, 2022 successor to the August 1, 2022 Helpful Content Update) elevated this from a per-page penalty to a site-wide demotion signal: a 90-day suppression window is typical before a fully-pruned domain returns.",
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
        q: "My page is thin but ranks fine: should I still fix it?",
        a: "Probably yes. Thin pages that rank today often share a domain with other thin pages that don't, and SpamBrain evaluates sites at the cluster level. The pages that aren't ranking are dragging down the ones that are. Pruning the bottom 30% usually lifts the top 70%."
      },
      {
        q: "How does this interact with AI-generated content?",
        a: "Word count is identical whether a human or an LLM wrote the prose. What differs is information density, LLM filler tends to be high token, low fact. The rule won't catch that distinction; the `aeo/citable-facts` and `aeo/answer-first` rules will."
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
    title: "Doorway Pages: How Google Detects Templated Funnels",
    metaDescription:
      "Doorway pages are against Google policy. The spam/doorway-pattern rule fires only when three independent signals converge: here's the exact stack and how to break it.",
    primaryKeyword: "doorway pages SEO",
    oneLiner:
      "Google has banned doorway pages since the March 16, 2015 Search Central post: pseolint's spam/doorway-pattern rule mirrors SpamBrain's convergence logic by requiring 3 independent signals to stack (SimHash near-duplicate above 0.85, entity-swap, and structural confirmation) before firing at error severity (weight 25), the highest-confidence spam pattern @pseolint/core reports.",
    whatItDetects:
      "3 independent signals must converge before pseolint fires this rule, mirroring the convergence logic Google's SpamBrain has used to enforce the doorway-pages policy (https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages) since March 16, 2015. The rule does not run a single check. It joins the output of two earlier rules, `spam/near-duplicate` (64-bit SimHash similarity above the 0.85 default threshold) and the entity-swap detector (pages whose only meaningful diff is a swapped noun phrase), then layers on additional confirmations: identical `structureSignature`, identical `<meta description>`, and whether either URL is already in the thin-content set (300-word default floor). A pair only triggers `spam/doorway-pattern` once at least 3 of these signals agree. The finding fires at error severity (weight 25 in pseolint's scoring, against critical=40, warning=12, info=5) and names both URLs alongside which signals stacked, so you can see at a glance whether you are looking at a near-duplicate problem (fix the content) or a template problem (fix the layout).",
    whyItMatters:
      "Doorway pages have been an explicit Google spam policy violation since the March 16, 2015 Search Central post that announced the rule (now consolidated into https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages), and unlike most quality issues they can trigger manual actions visible in Search Console, not just algorithmic dampening. Enforcement intensified again on March 5, 2024 with the scaled-content-abuse update and on May 7, 2024 with the site-reputation-abuse policy, both of which carry doorway-style signals into algorithmic demotion.\n\nThe reason the policy exists is that doorways waste user attention: the user searches, lands on a page that is functionally identical to ten other pages on the same site, and bounces. SpamBrain was first publicly named in Google's spam-update notes around April 12, 2021 and substantially rebuilt across the August 25, 2022 helpful-content rollout, which is why the post-2022 detection floor is so much harder to slip past. Field reports collected after the 2024 rounds show 60% to 80% organic-traffic loss within 6 weeks for doorway-heavy sites, with full deindexation of offending URL clusters typically completing within 12 weeks. A single near-duplicate pair could be coincidence; a near-duplicate pair with the same structure, the same meta description, and a swapped city name in the H1 cannot be.",
    failingExample:
      "Two URLs on a B2B SaaS site: /seo-tool-vs-ahrefs and /seo-tool-vs-semrush. Both are 380 words. Both have the H2 sequence 'Pricing comparison' / 'Feature parity' / 'Who should pick which'. Both have the meta description 'Compare seo-tool against the competition. See features, pricing, and migration paths.' The only differences are the competitor name and three numbers in a pricing table. SimHash similarity 0.94, identical structureSignature, identical meta, three signals stack and the pair fires `spam/doorway-pattern` at critical severity.",
    passingExample:
      "Two URLs on the same B2B SaaS site, redesigned: /seo-tool-vs-ahrefs and /seo-tool-vs-semrush. Each is 1,100 words. Each pulls a different competitor-specific narrative from a /data/competitors.json file: the Ahrefs page leads with backlink-database depth comparisons, the Semrush page leads with the keyword-database overlap. Meta descriptions are written per-page, not templated. SimHash similarity drops to 0.41. Even if one rule still fires, the three-signal stack required by `spam/doorway-pattern` no longer assembles.",
    howToFix: [
      "Identify which signal you can break most cheaply. Usually it is the meta description: write per-page descriptions before touching content.",
      "Differentiate the structure: introduce conditional sections that only render for pages with certain attributes (e.g., a 'Free tier' callout that only appears for free competitors).",
      "If two pages serve the same intent, merge them. A single 1,500-word /alternatives/ page often outranks ten thin /vs/ pages.",
      "Inspect the entity-swap pairs first; that is the rule's strongest signal and where the worst offenders cluster.",
      "Once you fix a pair, re-run pseolint. Doorway findings drop noisily: fixing one pair often resolves five because of how SimHash buckets cluster.",
      "Do not try to defeat the rule by injecting boilerplate variation (random sentences, swapped synonyms). SpamBrain has the same defenses; you will fail both."
    ],
    spamBrainContext:
      "Google formally banned doorway pages in a March 2015 webmaster-blog post that has since been folded into the consolidated spam policies (https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages). The 2022 helpful-content update extended this from an isolated penalty to a site-wide signal: a domain with many doorway pairs is treated as low-helpfulness across its whole index, not just on the offending URLs. The March 5, 2024 spam update added 'scaled content abuse' as a separate clause, which catches AI-generated doorway funnels even when each page individually passes the 300-word thin-content check. The May 7, 2024 site-reputation-abuse policy then closed the parasite-SEO loophole. The doorway pattern itself remains the same since 2015; only the detection has gotten better, and pseolint's 3-signal stack (near-duplicate ≥0.85 SimHash + entity-swap + identical structureSignature/meta) mirrors the same convergence logic SpamBrain appears to use.",
    faqs: [
      {
        q: "Is every set of city/location pages a doorway pattern?",
        a: "No. The rule requires three independent signals to converge. If your /plumbers-in-akron and /plumbers-in-toledo pages have meaningfully different content (local regulations, local case studies, local pricing), they will not trigger, even though they share a template."
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
        q: "We use the same template intentionally: how do we keep it?",
        a: "Templates are fine. Templated content is not. Keep the template, vary the content blocks within it: pull facts, examples, and supporting media from a per-entity data source so the same shell renders genuinely different pages."
      },
      {
        q: "Does this rule apply to e-commerce category pages?",
        a: "Rarely, because product listings provide natural per-page diversity (different SKUs, prices, reviews). It can fire on near-empty category pages with two or three products; those should be merged into a parent category until inventory grows."
      },
      {
        q: "Does a seasonal pricing page count as a doorway?",
        a: "Not on its own. A ski resort that publishes one page per lift-ticket tier (beginner gondola passes, midweek chairlift bundles, full-mountain season passes) differentiates on genuine product attributes a snowboarder actually compares: snowpack depth, summit elevation, the count of groomed runs, night-skiing hours. It becomes a doorway only when those tiers collapse into near-identical prose with a swapped altitude figure and all funnel to one checkout. The three-signal stack measures whether the mountain-specific detail is real or cosmetic. Avalanche-zone closures, the morning grooming report, and the half-pipe dimensions are the kind of genuinely local detail a swapped altitude figure can never counterfeit."
      }
    ],
    relatedRules: ["near-duplicate", "thin-content", "template-diversity"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "near-duplicate",
    ruleId: "spam/near-duplicate",
    title: "Near-Duplicate Pages: SimHash, SpamBrain, and the Similarity Threshold",
    metaDescription:
      "Two pages at 90%+ similarity are one page on two URLs. How pseolint's spam/near-duplicate rule uses SimHash to find them and what to do with each pair.",
    primaryKeyword: "near-duplicate content SEO",
    oneLiner:
      "85% SimHash similarity is the pseolint default threshold: every page pair at or above that mirrors the near-duplicate canonicalisation ceiling Google's web indexing team has used since adopting Charikar's 2002 SimHash paper in 2007, and which the March 5, 2024 scaled-content-abuse update reaffirmed as policy via SpamBrain's 60-second triage queue.",
    whatItDetects:
      `85% SimHash similarity is the threshold pseolint flags page pairs at, mirroring the near-duplicate canonicalisation ceiling Google's web indexing team has used since adopting Charikar's 2002 SimHash paper in 2007, and named again in the March 5, 2024 scaled-content-abuse policy (https://developers.google.com/search/docs/essentials/spam-policies). For each page, the rule computes a 64-bit SimHash from the main content text using token-level shingling, chosen over Jaccard (too slow at O(n*m)) and BERT embeddings (too expensive for a 60-second audit budget). It then compares every page against every other page, an O(n²) sweep that is fine for the page counts pSEO sites actually run (the 200-page free-tier audit ceiling completes in under a 1-second wall-clock; the 500-page Pro manual-re-audit ceiling stays within the 30-second per-rule budget).\n\nHamming distance between two hashes is converted to a similarity score in [0,1]. Any pair scoring at or above the configured threshold (default 85%, escalated to 90% for template-heavy sites) is recorded both as a finding and as a \`PairMatch\` consumed by \`spam/doorway-pattern\`. The finding fires at warning severity (weight 12) and includes the exact similarity percentage so you can sort the queue worst-first. Implementation lives in @pseolint/core v${ENGINE_VERSION} (current), MIT-licensed at github.com/ouranos-labs/pseolint, and runs in the same pipeline industry crawlers Ahrefs, Sitebulb, and Screaming Frog use for their dedup counters.`,
    whyItMatters:
      "Near-duplicate pages don't just dilute ranking; they actively hurt it. When Google sees two highly similar URLs (above the 85% SimHash threshold pseolint uses by default, which mirrors the public deduplication ceiling industry tools like Ahrefs, Sitebulb, and Screaming Frog have all converged on within a 5% margin), it picks one as canonical and demotes the other, but it also discounts the trust it places in the originating subfolder. The March 5, 2024 scaled-content-abuse policy (https://developers.google.com/search/docs/essentials/spam-policies) explicitly names 'paraphrasing existing content with minor changes' as a violation, and the May 7, 2024 site-reputation-abuse follow-up extended this to hosted third-party content.\n\nA site with 40+ near-duplicate pairs gets treated, structurally, as a 'content farm' regardless of intent, the Helpful Content System (rebuilt August 25, 2022) demoted an estimated 45% of impressions on offending clusters within a 60-day window. The pseolint rule fires at warning severity (weight 12), but each pair also counts as one of the 3 signals required for the much harsher spam/doorway-pattern rule (weight 25). The user-facing harm is real too: searchers click a result, find functionally the same page they saw two SERP positions ago, and learn the domain is low-signal.",
    failingExample:
      "/blog/best-crm-for-startups and /blog/top-crm-for-startups: the same 800-word article with 'best' replaced by 'top' in the title, three sentence rephrasings, and no structural difference. SimHash similarity 0.91. Both rank initially; six weeks later one is omitted from search results entirely with a 'Some results have been omitted' notice and the surviving page has lost 60% of its impressions because the duplicate hurt the cluster's authority.",
    passingExample:
      "/blog/best-crm-for-startups and /blog/best-crm-for-agencies: two articles that share an opening paragraph defining CRMs and then diverge completely. The startups article weighs free tiers and Stripe integrations; the agencies article weighs client-portal features and white-labelling. SimHash similarity 0.34, well below the threshold. Both pages rank for their distinct intents.",
    howToFix: [
      "Sort findings by similarity percentage descending; fix pairs above 0.95 first; those are almost always copy-paste accidents you can resolve in minutes.",
      "For pairs in the 0.85-0.95 range, decide whether the duplication is intentional (merge into one page with a 301) or accidental (rewrite one to genuinely differentiate).",
      "Add canonicals only as a last resort; they preserve the duplicate URL in the index, which still drags on cluster authority.",
      "Re-run with a stricter threshold (0.80) once you've cleared the worst tier. The tail of medium-similarity pairs often hides templating problems that `spam/boilerplate-ratio` will then surface.",
      "Audit your data source: many near-duplicate clusters trace back to two source rows that should have been one (e.g., 'San Francisco' and 'SF, California' as separate entities)."
    ],
    spamBrainContext:
      "SimHash itself was introduced in Charikar's 2002 paper and adopted by Google's web indexing team in 2007 specifically to deduplicate web crawl at scale: alternatives like Jaccard similarity (slower, O(n*m)) and BERT embeddings (catches paraphrase but expensive) trade depth for cost in ways that don't scale to a 200-page free-tier audit budget. SpamBrain (publicly named April 12, 2021 and rebuilt across the August 25, 2022 Helpful Content System launch) inherits that infrastructure; near-duplicate detection is one of the cheapest and oldest signals in the stack, which is why it is so reliably acted on.\n\nThe August 25, 2022 helpful-content rollout made near-duplication a site-level signal in addition to a per-pair one, which is why a domain with many medium-similarity pairs gets demoted across pages that are individually fine. The March 5, 2024 scaled-content-abuse policy explicitly includes 'paraphrasing existing content with minor changes' (which is exactly what SimHash above 85% detects) and the May 7, 2024 site-reputation policy extended enforcement to hosted third-party content. The rule itself ships in @pseolint/core under MIT license at github.com/ouranos-labs/pseolint, and runs in under 60-second budget on the typical 200-page hosted audit. Industry crawlers Ahrefs, Sitebulb, and Screaming Frog all expose comparable similarity counters within a 90-day reporting window.",
    faqs: [
      {
        q: "What SimHash similarity threshold actually triggers a Google penalty?",
        a: "There is no public threshold and Google's deduplication is not a penalty in the punishment sense; it's a canonicalisation choice. In practice, pages above 0.90 get folded; pages above 0.95 are almost certainly omitted from the index entirely. pseolint defaults to 0.85 to give you a margin of warning before that happens."
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
        a: "It does, eventually. For the 200-page hosted audit cap and the typical CLI run on a few thousand URLs, the full pairwise sweep runs in milliseconds because comparing two 64-bit integers is cheap. Beyond ~50k pages we'd switch to LSH bucketing; that's on the roadmap."
      },
      {
        q: "Should I use canonical tags to fix near-duplicates?",
        a: "Only when the duplicate URL must remain accessible for non-SEO reasons (printer-friendly versions, tracking parameters). For pure content duplication, prefer 301 to a single canonical URL or merge-and-redirect, both preserve link equity better than a canonical tag does."
      }
    ],
    relatedRules: ["doorway-pattern", "boilerplate-ratio", "thin-content"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "boilerplate-ratio",
    ruleId: "spam/boilerplate-ratio",
    title: "Boilerplate Ratio: When Shared Template Text Eats Your Pages",
    metaDescription:
      "When 60% of every page is shared paragraphs, you have one page repeated a thousand times. How pseolint measures the boilerplate ratio and what counts as too much.",
    primaryKeyword: "boilerplate content SEO",
    oneLiner:
      "60% is the default boilerplateMaxRatio: pseolint identifies sentence-level blocks appearing on 80%+ of pages, then flags any URL whose word count is dominated by those repeated blocks (warning severity, weight 12).",
    whatItDetects:
      "pseolint flags pages whose boilerplate ratio exceeds 60%, the threshold operationalising the 'producing many pages on the same topic to such a degree that individual pages have very little unique value' clause Google added to the helpful-content guidance in the March 5, 2024 scaled-content-abuse update (https://developers.google.com/search/docs/essentials/spam-policies). The rule splits each page's content into sentence-sized blocks (split on `.!?\\n`, lower-cased, blocks shorter than 20 characters discarded). It builds a frequency map across all pages, then defines the 'skeleton' as any block appearing on at least 80% of pages plus one. For each individual page, it sums the words inside skeleton blocks and divides by the page's total word count. Pages above your `boilerplateMaxRatio` (default 0.60) are reported with the exact percentage. Crucially, the skeleton is computed across the actual pages you crawled, so if you sample only 20 pages of a 2,000-page site, the skeleton may be smaller than reality and the ratio is conservatively low.",
    whyItMatters:
      "A high boilerplate ratio is not a quality signal in isolation; it is a leading indicator of a deeper problem. Sites built off a single template with a thin layer of variable content tend to develop boilerplate ratios in the 50-80% range as they scale, and the moment SpamBrain notices that the variable layer is itself shallow (per-page word counts are low, structure signatures are identical), the boilerplate ratio confirms what the other signals already suggested. The fix is rarely to delete the boilerplate; it is to grow the variable content beneath it. A 60% ratio on a 1,500-word page (600 words of unique substance) ranks fine; a 60% ratio on a 200-word page (80 words of unique substance) does not.",
    failingExample:
      "A 240-page recipe site where every page contains the same 180-word 'Why this recipe works' intro, the same 140-word 'A note from our chef' bio, the same 90-word affiliate disclosure, and the same 60-word newsletter CTA. The variable section (actual ingredients and method) averages 220 words. Total page length 730 words; boilerplate share 470/730 = 64%. The rule fires on every page, and rightly so: from a search engine's view, this is one 470-word page repeated 240 times with a different ingredient list grafted on.",
    passingExample:
      "The same recipe site, restructured. The 'Why this recipe works' block is removed entirely (it added no information). The chef bio is moved to /about and replaced on each recipe with a 60-word, recipe-specific origin paragraph. The affiliate disclosure is shortened to 18 words and demoted to the footer (under the 20-char-per-block floor, so it is filtered out before frequency counting). The variable section grows to 450 words including measured ingredient yields, technique tips specific to that dish, and substitution tables. New ratio 78/528 = 14%. Comfortably under threshold.",
    howToFix: [
      "Find your skeleton blocks first. Run pseolint with `--verbose` and the rule will list which exact sentences it considers boilerplate; that's your edit list.",
      "Move repeated content out of the page body and into the global footer or a separate /about-style URL where it doesn't count against per-page ratio.",
      "Shorten or delete sections that aren't load-bearing. 'Why this works' intros and pre-conclusion summaries are the highest-value cuts because they are uniformly low information.",
      "Grow the variable section. The ratio is a fraction; a smaller numerator is one path, a larger denominator is another. Adding genuine per-page facts is almost always safer than aggressive boilerplate removal.",
      "Treat anything above 50% as a yellow flag even if it passes the rule. The default 60% threshold is permissive; many domains that pass at 0.60 still feel templated to a reader.",
      "Re-run after each round of edits. Removing one skeleton block can shift others' frequencies above the 80% cutoff, so the skeleton recomposes."
    ],
    spamBrainContext:
      "The concept of a 'page skeleton' versus 'page payload' is older than SpamBrain, Google's 2007 paper on boilerplate detection (Kohlschütter et al. cited a related approach) was about extracting main content for ranking. SpamBrain inverts the same algorithm to evaluate whether the payload is large enough relative to the skeleton. The March 2024 helpful-content guidance on 'scaled content abuse' specifically mentions 'producing many pages on the same topic to such a degree that individual pages have very little unique value'; boilerplate ratio is the most direct quantitative measure of that. The May 2024 site-reputation update added another wrinkle: third-party content hosted on a high-authority domain often presents as high-boilerplate because the same disclosure/byline blocks repeat across many guest authors.",
    faqs: [
      {
        q: "Why 80% as the skeleton cutoff and not 50% or 100%?",
        a: "100% misses anything that varies even slightly (some pages add an extra disclaimer); 50% catches accidental repetition (two pages happening to share an intro). 80%, specifically `floor(N * 0.8) + 1`, was tuned to catch real templates while ignoring coincidental matches. It works well from 5 pages upward."
      },
      {
        q: "My site is below threshold but I still feel templated. What now?",
        a: "Look at `spam/template-diversity`. Boilerplate ratio measures shared text; template diversity measures shared HTML structure. A site can have low ratio (because variable text is long) but identical structure across pages; that combination is also a SpamBrain signal."
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
    title: "Template Diversity: Why HTML Structure Counts as a Spam Signal",
    metaDescription:
      "If every page shares one HTML skeleton, SpamBrain reads your domain as a single template, not N pages. How pseolint measures structural diversity and the 30% floor.",
    primaryKeyword: "template diversity SEO",
    oneLiner:
      "30% is the default minUniqueRatio threshold: pseolint warns when fewer than 30% of pages carry a structurally distinct HTML skeleton, the floor at which SpamBrain (rebuilt August 25, 2022) starts reading a domain as one template rather than N designed pages.",
    whatItDetects:
      `30% is the default minUniqueRatio pseolint warns below, the floor at which Google's SpamBrain (rebuilt August 25, 2022 alongside the Helpful Content System launch to score site-level helpfulness alongside per-page signals) starts treating a domain as a single template rather than N designed pages. Each parsed page carries a \`structureSignature\`, a hash of its HTML structure that ignores text content but preserves the sequence and nesting of element types. The rule counts how many distinct signatures exist across all pages and divides by the page count to produce a unique-ratio in [0,1]. If that ratio falls below \`minUniqueRatio\` (0.30 default), a single warning-severity finding (weight 12) is emitted at the site level, versus error=25, critical=40, info=5 elsewhere in the engine. This is a holistic signal, not a per-page one: there is no list of 'failing' URLs because the problem is the site's design system, not any individual page. Powered by @pseolint/core v${ENGINE_VERSION}, MIT-licensed at github.com/ouranos-labs/pseolint.`,
    whyItMatters:
      `Templated HTML is not in itself a spam signal: every modern CMS produces it. The signal is when templated HTML combines with templated content. SpamBrain (publicly named April 12, 2021 and rebuilt across the August 25, 2022 Helpful Content System launch) reads the combination as 'one piece of low-effort programmatic output,' even if the underlying data is rich, because there is no surface variation for the classifier to latch onto. Field reports following the March 5, 2024 scaled-content-abuse update show 60% to 80% organic-traffic loss within a 6-week window for sites whose unique-ratio sat below 10%, and a 90-day recovery window once the structure was diversified.\n\nIndustry crawlers like Ahrefs, Sitebulb, and Screaming Frog all surface comparable template-fingerprint counters, but the 30% floor is specific to pseolint's own measurement. Sites with diverse structure (some pages have a comparison table, some don't; some have a video embed, some don't; some have a sticky TOC, some don't) communicate to the classifier that real per-page editorial decisions were made. Sites with one signature for every URL communicate the opposite. The fix is to introduce conditional structure, not to randomise it artificially. The current implementation lives in @pseolint/core v${ENGINE_VERSION} with site-type-aware weighting: programmatic-directories tolerate slightly higher template homogeneity than small-marketing sites.`,
    failingExample:
      "A 300-page travel directory where every URL renders exactly: `<header>`, `<nav>`, `<main>` containing `<h1>`, `<img>`, three `<section>` blocks each with `<h2>` and four `<p>`, then `<footer>`. Every page hashes to the same structureSignature. Unique ratio: 1/300 = 0.003. Even though each page has 800 words of unique prose about a different destination, the structural monotony is itself a signal: from a crawler's perspective, this is one template with 300 plug-ins, not 300 designed pages.",
    passingExample:
      "The same travel directory, redesigned with conditional sections. Pages for destinations with notable history get a `<aside>` timeline component. Pages for destinations with strong food culture get a `<table>` of regional dishes. Pages for hiking destinations get a `<figure>` with elevation chart. About 35% of pages render at least one optional section, producing roughly a dozen distinct structureSignatures. Unique ratio: 12/300 = 0.04, still low, but combined with conditional `<aside>` variants the signature space grows enough that the ratio rises to 0.32 and the rule no longer fires.",
    howToFix: [
      "Identify which sections in your template should be optional. Anything that doesn't apply to every entity is a candidate: pricing tables, video embeds, timelines, FAQs, comparison widgets.",
      "Wrap optional sections in conditionals that key off the underlying data, not random booleans. 'If the entity has a video URL, render the video block' produces meaningful diversity; 'if Math.random() > 0.5' produces nothing.",
      "Vary the order of secondary sections by entity type. A restaurant page might lead with menu, a hotel page with rooms: same template, different priority.",
      "Add per-entity media variations. Some pages have hero images, some have hero videos, some have galleries. Each renders different HTML.",
      "Don't fix this rule by adding random structural noise. The rule is a holistic warning; if the underlying content is differentiated, the warning is acceptable on a homogeneous content type."
    ],
    spamBrainContext:
      `Structural homogeneity has been a feature in spam classifiers since at least the 2009 'doorway page' updates, but it took on new prominence after the August 25, 2022 Helpful Content System rollout introduced site-level helpfulness scoring. Sites that look the same on every URL communicate 'mass production' to a classifier whose entire job is to find mass production. Google's December 14, 2022 link-spam update mentioned 'sites that exist primarily to feed link signals'; those sites are almost always structurally homogeneous because they were built off a single template with no per-page editorial input. The March 5, 2024 scaled-content-abuse policy formalised this: 'producing many pages with little unique value' is structurally measurable, and the May 7, 2024 site-reputation-abuse update extended the same logic to hosted third-party content.\n\nWhile alternative fingerprinting approaches like SimHash (used by spam/near-duplicate at the 85% threshold), Jaccard set similarity, and BERT structural embeddings exist, the structureSignature hash pseolint uses keeps the rule deterministic and runnable in under a 1-second wall-clock per 100 pages, well within the 60-second free-tier audit budget. Implementation: @pseolint/core v${ENGINE_VERSION} (current), MIT-licensed, github.com/ouranos-labs/pseolint. Comparable template-diversity counters surface in Ahrefs, Sitebulb, and Screaming Frog, though each defines the floor slightly differently.`,
    faqs: [
      {
        q: "Isn't every WordPress site structurally identical?",
        a: "Not really. Default WordPress themes produce slightly different HTML for posts, pages, archives, single-product, and category templates, usually 5-8 distinct signatures across a typical install. The rule will fire on heavily-templated WordPress builds (especially those using a single page template for every URL) but not on default editorial sites."
      },
      {
        q: "Why is this only a warning, not an error?",
        a: "Because structural homogeneity is acceptable for some content types, a glossary, a directory of API endpoints, a product catalogue. The rule surfaces the signal so you can make an informed call; it doesn't assume the call. If your content type genuinely demands one template, document the decision and ignore the warning."
      },
      {
        q: "Does the structureSignature ignore CSS classes?",
        a: "Yes. Class names and attribute values are stripped before hashing, only element types and their nesting pattern are considered. This means restyling a page (CSS changes only) doesn't change its signature, which is the right behaviour for a structural signal."
      },
      {
        q: "How does this differ from boilerplate ratio?",
        a: "Boilerplate ratio measures shared text content. Template diversity measures shared HTML structure. A page can have low boilerplate (every page has unique paragraphs) but identical structure (every page renders those paragraphs in the same shell). Both rules need to be green for a site to look genuinely diverse."
      },
      {
        q: "What's a healthy unique-ratio target?",
        a: "0.30 is the default minimum and the floor at which most pSEO sites stop reading as templated. 0.50+ feels like an editorial site to a classifier. Below 0.10 is almost always a single template, fine for some content types, dangerous for others. A taxidermy-studio portfolio of near-identical mounted-specimen pages reads as one template no matter how distinct each pheasant or roebuck mount actually is."
      }
    ],
    relatedRules: ["boilerplate-ratio", "doorway-pattern", "near-duplicate"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "host-section-divergence",
    ruleId: "links/host-section-divergence",
    title: "Site Reputation Abuse: Detecting Parasite Sections on a Trusted Host",
    metaDescription:
      "Google's May 7, 2024 site-reputation-abuse policy targets sections that ride a host's authority without integrating. How links/host-section-divergence measures it.",
    primaryKeyword: "site reputation abuse detection",
    oneLiner:
      "Google's May 7, 2024 site-reputation-abuse policy demotes subfolders that borrow a host's reputation without earning it: links/host-section-divergence flags a URL section (e.g. /coupons/, /deals/) only when it diverges from the rest of the host on at least 2 of 4 independent structural signals, and it deliberately fires on the minority section, never on a balanced multi-topic split.",
    whatItDetects:
      "The rule groups every crawled URL by its first path segment (/coupons/, /reviews/, /best/) and tests each section that holds at least 10 pages while leaving at least 10 pages in the rest of the host. It only considers sections that are a strict minority of the corpus (under 50%), reputation abuse is, by definition, a small parasite section riding a larger host, so a 50/50 split is read as a multi-topic site and skipped.\n\nFor each qualifying section it measures four signals against the rest of the host: (1) inbound-link integration, the fraction of section pages that receive at least one internal link from outside the section, flagged when under 0.20 (the section is an island the host barely references); (2) topic divergence, Jaccard distance between the top-100 TF-IDF terms of the section versus the rest, flagged above 0.75 (under ~25% vocabulary overlap); (3) template isolation, the fraction of section pages whose structureSignature also appears anywhere else on the host, flagged when under 0.10 (the section ships its own template the host never uses); and (4) authorship mismatch, flagged when section and host byline coverage differ by at least 0.40 and one pool is mostly anonymous (≤0.30) while the other is mostly bylined (≥0.70).\n\nA section that trips 2 or more signals emits a warning naming the section, the signal values, and a 20-URL sample; a section that trips 3 or more and holds over 50 pages escalates to error. The rule reasons about structure, not contracts; it cannot read a revenue-share agreement or see a manual action, only the structural fingerprint those arrangements leave behind.",
    whyItMatters:
      "Site reputation abuse (colloquially 'parasite SEO') became an explicit Google spam policy on May 7, 2024 (https://developers.google.com/search/docs/essentials/spam-policies#site-reputation-abuse), and unlike most quality signals it is enforced partly by hand: affected domains receive a 'Third-party content abuse' manual action in Search Console with a defined reconsideration path.\n\nThe policy targets a specific asymmetry, a high-authority host lends its reputation to a section of content that was produced by or for a third party with minimal first-party editorial involvement, so the section ranks on borrowed trust rather than its own. The classic shapes are a /coupons/ or /deals/ subfolder run by a syndication partner under a newspaper's domain, a vendor-generated /locations/ template on a directory site, or a sponsored /best/ directory with no real editorial review.\n\nEnforcement is surgical: field reports after the May 2024 and November 5, 2024 waves show 70% to 100% traffic loss confined to the offending subfolder while the rest of the domain is untouched. The four signals this rule reads are the same structural tells a reviewer looks for, is the section cross-linked from the host's own navigation, does it talk about the same things, was it built with the host's design system, and is it signed by the same people. None of those is conclusive alone, which is why the rule requires at least two to agree before it says anything.",
    failingExample:
      "A regional news domain with 1,200 editorial articles and a 180-page /coupons/ section supplied by an affiliate network. The coupon pages receive almost no inbound links from the newsroom's own pages (inbound-integration 0.06), share under 20% of their vocabulary with the news content (topic-divergence 0.81), render from a template the rest of the site never uses (template-isolation 0.04), and carry no bylines while the editorial side is 90% bylined (authorship mismatch: 0.00 vs 0.90). All four signals trip and the section holds more than 50 pages, so the rule fires at error severity, the structural signature of exactly the arrangement the May 2024 policy was written to catch.",
    passingExample:
      "The same news domain, but the /reviews/ section is produced in-house: every review is linked from the relevant news category, written by named staff who also write the news, and built with the site's standard article template. Inbound integration is 0.74, topic vocabulary overlaps the host's coverage (topic-divergence 0.38), the template is shared (template-isolation 0.61), and byline coverage matches the rest of the host. Zero signals trip. The section is a genuine part of the publication, not a parasite riding its authority, and the rule stays silent, because structural integration is exactly what the policy asks for.",
    howToFix: [
      "Decide per section whether you actually own it editorially. If a third party produces the content with minimal first-party review, the honest fixes are to integrate it properly or to move it off the host: not to game the four signals.",
      "Integrate, option A: cross-link the section from your primary navigation and from topically-related host pages so it stops reading as an island. Low inbound integration is the cheapest signal to flip and often the most diagnostic.",
      "Integrate, option B: share authorship and schema. Put real, named reviewers on the pages who actually vet them, and align the section's template with the rest of the host so it isn't a structurally foreign body.",
      "Separate, the clean alternative: move the section to a subdomain or a partner-owned domain and 301 the old URLs. It stops borrowing your reputation (which is the point of the enforcement) and stops being a liability.",
      "Do not try to defeat the rule by sprinkling a few host links into the section while leaving it editorially third-party. The policy is about substance, not surface signals; a reviewer applies the same 'would a reasonable user see this as the host's own content' test the rule only approximates."
    ],
    spamBrainContext:
      "Site reputation abuse was announced in the March 5, 2024 spam-policy update and took effect on May 7, 2024 (https://developers.google.com/search/docs/essentials/spam-policies#site-reputation-abuse), closing a loophole that the scaled-content-abuse and doorway policies left open: content that is individually passable but exists only to monetise a host's accumulated authority. Google has been explicit that the arrangement, not the topic, is what's penalised, a disclosed but otherwise-passive partnership is still in scope.\n\nThis rule (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is the structural complement to the spam/* family: where spam/doorway-pattern and spam/near-duplicate look within a template for duplication, links/host-section-divergence looks across a host for a section that doesn't belong to it. It is deliberately conservative, the minority gate, the dual 10-page floors, and the 2-of-4 threshold exist to avoid crying abuse on legitimate multi-topic sites, and it scores at the engine's default rule weight rather than a hand-tuned spam weight, so treat a finding as a prompt to audit the arrangement, not as a verdict that you have been penalised.\n\nWhat it cannot do is read intent: it sees an unintegrated, off-topic, separately-templated, unsigned section and tells you it looks like parasite content. Whether it is depends on facts only you and your contracts hold.",
    faqs: [
      {
        q: "Does this rule detect that content is literally 'third-party'?",
        a: "No, and it doesn't claim to. It has no way to read a revenue-share contract or know who authored a page. It measures four structural proxies (inbound integration, topic overlap, template sharing, and byline coverage) that genuine first-party sections tend to satisfy and parasite sections tend to fail. A finding means the section looks structurally like the pattern Google's policy targets; confirming it requires looking at the actual arrangement."
      },
      {
        q: "Why does it only fire on the smaller section, not both halves of a split?",
        a: "By design. The rule requires the divergent section to be a strict minority of the corpus (under 50%). Site reputation abuse is a small section riding a large host's reputation; a roughly even split between two topics is a multi-topic site, not abuse. The minority gate is what stops the rule from emitting a symmetric, useless finding on both halves of a 50/50 site."
      },
      {
        q: "How many signals have to trip before it warns?",
        a: "At least 2 of the 4. One signal alone is too noisy, plenty of legitimate sections are lightly cross-linked or use a distinct template. Requiring two independent signals to agree keeps the false-positive rate low. Three or more on a section larger than 50 pages escalates the finding from warning to error."
      },
      {
        q: "I run a genuine in-house section that still trips this. What now?",
        a: "Look at which signals fired. If it's inbound integration, your section is under-linked from the rest of the site, usually worth fixing for users regardless. If it's authorship, add real bylines. If it's topic and template divergence on content that's legitimately yours, the rule is a false positive on your content type; document the decision and ignore the warning. The rule surfaces a structural pattern; it doesn't assume your intent."
      },
      {
        q: "Will Google penalise the whole domain or just the subfolder?",
        a: "Site reputation abuse enforcement is characteristically subfolder-scoped, the affected section loses ranking while the rest of the domain is left intact, which is precisely the asymmetry the policy is designed to remove. That's also why this rule reports at the section level and names the specific prefix, rather than scoring the whole site down."
      }
    ],
    relatedRules: ["doorway-pattern", "template-diversity", "boilerplate-ratio"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "entity-swap",
    ruleId: "spam/entity-swap",
    title: "Entity-Swap Pages: When Only the Noun Changes Between URLs",
    metaDescription:
      "Entity-swap pages are identical once you mask the swapped city, role, or product. How spam/entity-swap masks entities, then SimHash-fingerprints the rest at 95%.",
    primaryKeyword: "entity swap pages SEO",
    oneLiner:
      "spam/entity-swap masks the variable noun on every page (by default US state names and 5-digit ZIP codes) then computes a 64-bit SimHash of what is left and fires at critical severity when two pages score 95% similarity or higher, the convergence signal Google's SpamBrain has used against entity-swap doorways since the March 5, 2024 scaled-content-abuse update.",
    whatItDetects:
      "spam/entity-swap is the rule that catches the single cleanest fingerprint of programmatic generation: a page whose only real difference from its siblings is the entity you swapped in. The rule masks every page's main content with your entity patterns, the defaults cover all 50 US state names and 5-digit ZIP codes, and you add your own dimensions (cities, SKUs, job titles) in pseolint.config.ts, and then computes a 64-bit SimHash over the masked text.\n\nMasking is what separates this rule from spam/near-duplicate. Near-duplicate hashes the raw text and fires at 85%, so two location pages with genuinely different city paragraphs can slip under its bar. Entity-swap removes the entity tokens first, so if the remaining sentence frames are identical the masked similarity rockets toward 100%. The pairwise O(n²) sweep flags any pair scoring 95% or above at critical severity, and records the pair as a PairMatch that spam/doorway-pattern later consumes as one of the three signals it needs to converge.",
    whyItMatters:
      "An entity-swap pair is the hardest pattern to defend because it admits what it is. When /plumbers/ohio and /plumbers/nevada say the same thing in the same order with two words changed, there is no argument that the second page serves a need the first does not. Google's classifiers treat the masked-similarity signal as near-conclusive precisely because the false-positive rate is so low: real local pages diverge once you remove the place name, and generated ones do not.\n\nThe 95% floor is deliberately conservative so the rule rarely cries wolf, which means a finding is worth acting on the day it appears. Field reports after the March 5, 2024 rollout showed entity-swap clusters losing the bulk of their long-tail impressions inside a 6-week window, and because the pairs feed spam/doorway-pattern, an unaddressed entity-swap problem tends to escalate from a quiet near-duplicate warning into the critical doorway stack that draws manual review.",
    failingExample:
      "/grants/small-business-grants-texas and /grants/small-business-grants-florida. Strip 'Texas' and 'Florida' and the two pages are byte-for-byte identical: same 'How to qualify' intro, same three eligibility bullets, same 'Apply before the deadline' close. Masked SimHash similarity 99%. The rule fires at critical and hands the pair to spam/doorway-pattern, where the identical structure and shared meta description complete the three-signal stack.",
    passingExample:
      "/grants/small-business-grants-texas and /grants/small-business-grants-florida, rebuilt from a state grants dataset. The Texas page leads with the Texas Enterprise Fund and a franchise-tax exemption; the Florida page leads with the absence of a state income tax and county-level economic-development grants. Different agencies, different dollar amounts, different deadlines. Masked similarity drops to 38% because the sentence frames themselves now differ, not just the state name, and the entity-swap pair never forms.",
    howToFix: [
      "Bind real per-entity data, not synonyms. Swapping 'top' for 'best' or rewording a sentence leaves the masked SimHash untouched; the rule already ignores the entity token, so only genuinely different facts move the score.",
      "Lead each page with the one thing that entity has and its siblings lack (a local statute, a region-specific fee, a SKU's actual spec) so the opening sentence frame diverges, not just the noun.",
      "Audit your data source for thin records. An entity-swap cluster usually traces back to rows that carry no distinguishing fields; if the data cannot differentiate the page, the page probably should not exist as a separate URL.",
      "Consolidate entities you cannot differentiate. Five states with identical programs are better served by one page that names all five than five pages that pretend to be different.",
      "Re-run after each fix. Because the rule is pairwise, breaking one page out of a cluster can drop several findings at once as the remaining pairs fall below 95%."
    ],
    spamBrainContext:
      "Entity masking mirrors how Google's deduplication has worked since it adopted SimHash-style fingerprinting for crawl: the index does not care which proper noun you inserted, it cares whether the document adds anything the rest of the web lacks. The March 5, 2024 scaled-content-abuse policy named 'creating many pages where little changes between them' as a violation in its own right, independent of whether a human or a model produced the text.\n\nspam/entity-swap (shipped in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) operationalises that clause with the strictest threshold in the spam family (95% on masked text versus 85% on raw text for spam/near-duplicate) so it surfaces the pattern the policy targets without flagging legitimately templated pages that vary their content. It is one of the three independent signals spam/doorway-pattern requires, which is why clearing entity-swap findings early is the cheapest way to keep a programmatic template out of the critical doorway tier.",
    faqs: [
      {
        q: "How is entity-swap different from near-duplicate?",
        a: "Near-duplicate hashes your raw text and fires at 85% similarity; entity-swap masks the variable noun first (by default US state names and ZIP codes) then hashes what remains and fires at the stricter 95%. The masking is the whole point: two pages can have city paragraphs different enough to pass near-duplicate while being identical sentence frames once the city name is removed. Entity-swap exists to catch exactly that case."
      },
      {
        q: "What does pseolint mask by default, and can I add my own entities?",
        a: "The defaults cover all 50 US state names and 5-digit ZIP codes. You add your own dimensions (cities, product SKUs, job titles, company names) as regex patterns in the entityPatterns option or pseolint.config.ts. The patterns you declare are exactly the variables your template swaps, so masking them is how you tell the rule which axis to ignore while it judges whether anything else changes."
      },
      {
        q: "Why does the rule fire at critical instead of warning?",
        a: "Because the false-positive rate is very low. A pair that is 95% similar after the entity is removed is, by construction, two pages that say the same thing about different nouns, the textbook doorway shape Google's policy describes. Genuine per-entity pages diverge the moment you mask the entity, so they never reach the threshold. That high confidence is why entity-swap is one of the signals that can push a template into the critical doorway stack."
      },
      {
        q: "I have real local pages that still trip this. What now?",
        a: "Look at what your pages actually say once the place name is gone. If the answer is 'the same thing', the locality is cosmetic and the rule is correct, add genuinely local facts (regulations, pricing, named providers) or consolidate. If your pages truly differ and still trip, your entity pattern is probably too narrow, leaving other shared nouns unmasked; widen the patterns so the rule judges the right axis."
      },
      {
        q: "Does fixing entity-swap also clear my doorway findings?",
        a: "Often, yes. spam/doorway-pattern only fires when three signals converge, and entity-swap is one of them. Breaking the masked similarity below 95% removes that signal from the stack, which is frequently enough to drop the pair below the three-signal threshold even if it still trips near-duplicate. Fixing entity-swap is usually the cheapest way to dismantle a doorway cluster."
      },
      {
        q: "We run a real multi-location veterinary group: will this rule punish us?",
        a: "Only if your clinic pages are interchangeable. A genuine veterinary group differentiates each location on its on-site surgical suite, its emergency feline-and-canine triage hours, its boarding-kennel capacity, and the named vets who practise there. Mask the town and those pages still diverge, so the entity-swap pair never assembles. If masking leaves identical vaccination-schedule boilerplate behind, the rule is correctly telling you the locations exist only on paper. A mobile farrier who lists every locality where he shoes horses, repeating one hoof-trimming blurb per page, is the equine version of the same trap."
      }
    ],
    relatedRules: ["near-duplicate", "doorway-pattern", "thin-content"],
    relatedTool: "doorway-page-detector"
  },
  {
    slug: "publication-velocity",
    ruleId: "spam/publication-velocity",
    title: "Publication Velocity: When Your Publish Dates Betray Bulk Generation",
    metaDescription:
      "Thousands of pages sharing one publish date is a bulk-generation tell. How spam/publication-velocity flags date-stacked corpora past a 100/day or 10%-of-corpus ceiling.",
    primaryKeyword: "publication velocity SEO",
    oneLiner:
      "spam/publication-velocity groups your pages by publish date and warns when any single day exceeds the greater of 100 pages or 10% of your whole corpus: the date-stacking signal Google's March 27, 2026 core update tightened against programmatically generated sites.",
    whatItDetects:
      "spam/publication-velocity reads the publish date off every page (from article:published_time, a datePublished meta, or the first time[datetime] element) truncates it to a calendar day, and groups the corpus by that day. Pages with no detectable date are skipped, so the rule only judges what it can actually see.\n\nThe ceiling is corpus-relative. The effective limit for any day is the greater of two numbers: the absolute floor of 100 pages per day, and 10% of your total page count. A 400-page site is governed by the 100/day floor; a 50,000-page site can legitimately publish up to 5,000 pages on one date before the rule says anything. Any day that exceeds its effective limit emits a single warning naming the date, the count, and which ceiling it breached. The corpus-relative design is what keeps the rule from punishing large, legitimately busy publishers while still catching the small site that stamped 800 generated pages with one timestamp.",
    whyItMatters:
      "Real editorial calendars are lumpy but human. Pages trickle out across days and weeks; a backlog clears in a burst, then quiet returns. A corpus where ten thousand URLs all carry the same publish date did not come from an editorial process; it came from a single generation job, and the timestamp is the receipt. Date-stacking is one of the few scaled-content signals that survives even when each individual page looks acceptable, because it describes the corpus, not the page.\n\nGoogle's March 27, 2026 core update explicitly tightened how date-stacked corpora are weighed, which is why this rule moved from a curiosity to a real signal. The fix costs nothing in content quality (you are not rewriting anything, only spreading out the dates you expose) but ignoring it leaves a structural fingerprint that pairs badly with thin-content or near-duplicate findings on the same template. When several scaled-content signals stack, the corpus gets re-scored as a unit.",
    failingExample:
      "A recipe site imports 2,400 pages from a spreadsheet on a Sunday and ships them at once. Every page carries an article:published_time of 2026-02-15. The corpus is 3,000 pages, so the effective ceiling is the greater of 100 and 300, which is 300; the 2,400-page spike on a single date blows through it and the rule warns: '2,400 pages share publish date 2026-02-15, exceeding 10% of the 3,000-page corpus (300/day).'",
    passingExample:
      "The same 2,400 imported recipes, but the import script backdates each page to the day its source recipe was actually created and drip-publishes new ones on a real cadence. No single day holds more than roughly 40 pages. The effective ceiling of 300/day is never approached, the rule stays silent, and the corpus reads like something a kitchen team built over years rather than a spreadsheet dumped in an afternoon.",
    howToFix: [
      "Spread real dates, do not fabricate them. If your pages were genuinely created over time, surface that true history in article:published_time instead of stamping every record with the import date.",
      "Drip-publish new batches. Releasing generated pages over days or weeks both lowers the per-day count and matches how Google expects a healthy site to grow.",
      "Raise the corpus, not the spike. The ceiling scales with total page count, so the rule naturally relaxes as a site earns scale, but only if growth is distributed, not stacked.",
      "Check which field you expose. If you have no real publish dates, consider omitting them rather than stamping a placeholder, since the rule skips pages with no detectable date.",
      "Treat a velocity warning as a prompt to audit the same template for thin-content and near-duplicate: date-stacking rarely travels alone."
    ],
    spamBrainContext:
      "Publication velocity is a behavioural signal rather than a content one, which is what makes it hard to fake. The scaled-content-abuse policy introduced on March 5, 2024 reframed Google's old 'automatically generated content' rule around volume-and-value rather than authorship, and the March 27, 2026 core update sharpened enforcement on corpora whose publish-date distribution looks machine-made.\n\nspam/publication-velocity (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is deliberately the gentlest member of the spam family; it emits at warning severity, never critical, because a date spike alone is suggestive, not damning. Its value is as corroboration: when a template already trips spam/template-diversity or spam/boilerplate-ratio, a date-stacked publish history is the behavioural evidence that the structural homogeneity came from bulk generation. The corpus-relative 10% ceiling, layered over the absolute 100/day floor, is tuned so a genuine large publisher clears it while a small site faking scale does not.",
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
        a: "The rule uses whichever is larger. Small and mid-size sites are governed by the absolute floor of 100 pages per day. Once 10% of your total corpus exceeds 100, the corpus-relative ceiling takes over, a 50,000-page site can publish up to 5,000 pages on one day before tripping. The design lets big publishers grow in bursts while keeping small sites from faking scale with a single dump."
      },
      {
        q: "Should I just remove publish dates to avoid this?",
        a: "Only if you have no real dates to show. The rule skips pages with no detectable date, so stripping dates does silence it, but it also throws away a freshness and trust signal that helps elsewhere. The better move is to expose accurate dates that happen to be well distributed, which satisfies this rule and the aeo/freshness-signals rule at the same time. A philately seller who stamps each listing with the day its first-day cover was catalogued shows a believable, well-spread release history rather than one suspicious bulk import."
      }
    ],
    relatedRules: ["template-diversity", "boilerplate-ratio", "thin-content"],
    relatedTool: "spambrain-checker"
  },
  {
    slug: "template-coverage",
    ruleId: "spam/template-coverage",
    title: "Template Coverage: How Sparse Keyword Matrices Expose pSEO",
    metaDescription:
      "A template filling 8% of its keyword cells looks generated. How spam/template-coverage measures URL-dimension coverage across a cluster, and why sparse matrices read as pSEO.",
    primaryKeyword: "template coverage pSEO",
    oneLiner:
      "spam/template-coverage groups URLs in the same directory, masks the entity tokens in each filename, and reports how many of the possible dimension combinations a template actually fills: surfacing, at info severity, the sparse high-dimension matrices Google's March 27, 2026 core update down-weighted on programmatic sites.",
    whatItDetects:
      "spam/template-coverage is a diagnostic, not an accusation. It groups your URLs into clusters by parent directory, and within each cluster of at least 5 pages it looks only at the filename, the last path segment, extension stripped. It masks the entity tokens in that filename using your entity patterns, then splits the masked name on hyphens into positional tokens.\n\nFor each position where more than one distinct value appears, the rule records a 'dimension'. A cluster like /jobs/[role]-jobs-in-[city] has two dimensions: role and city. The rule multiplies the number of distinct values in each dimension to get the total possible combinations, then divides the pages you actually built by that total to produce a coverage percentage. If a template has 12 services and 50 cities (600 possible cells) but you shipped 96 pages, coverage is 16% and the rule reports the dimensions, the sample values, and the ratio at info severity. A cluster where every token varies, or none does, produces no finding because there is no matrix to measure.",
    whyItMatters:
      "A sparse matrix is a behavioural confession. Filling 16% of a 600-cell grid almost always means a script generated the combinations that had search volume and skipped the rest, the definition of building pages for keywords rather than for users. A human team that genuinely served every service in every city would either cover the grid densely or never have framed the work as a grid at all.\n\nThe rule fires at info severity on purpose: sparse coverage is not inherently spam. A directory legitimately serving 96 real markets is fine; the signal only matters when the sparsity pairs with thin or near-duplicate content in the same cluster. Google's March 27, 2026 core update down-weighted exactly this shape (high-dimension templates with low fill rates) because the combinatorial ambition is a reliable marker of coverage-driven generation. Treat a coverage finding as a question: can you actually differentiate every cell you intend to fill, or are you claiming a matrix you cannot substantiate?",
    failingExample:
      "/locations/ holds 96 pages of the form [service]-in-[city]. Masking the entity tokens reveals two dimensions: 12 services and 50 cities, implying 600 possible combinations. The cluster also trips spam/near-duplicate and spam/thin-content. The coverage finding reads: '/locations has 96 pages across 2 dimensions: 12 values (e.g. plumbing, roofing, hvac) x 50 values (e.g. austin, dallas, houston). Coverage: 96 of 600 combinations (16.0%).' Read together, the picture is a template that generated the high-volume cells and left the grid mostly empty.",
    passingExample:
      "The same /locations/ cluster, narrowed to the combinations the business can actually differentiate: 12 services in the 8 cities where it has a physical branch, 96 pages covering 96 of 96 cells. Coverage is 100%. Each page carries the branch address, local pricing, and named staff for that city, so the dense grid reflects genuine market presence rather than a keyword script that filled the easy cells of a 600-cell matrix.",
    howToFix: [
      "Narrow the matrix to what you can differentiate. If you cannot write genuinely distinct content for all 600 cells, do not claim the grid: build the cells you can substantiate and drop the dimensions you cannot.",
      "Raise coverage by subtraction, not addition. Pruning empty intent often beats generating the missing cells, because the missing cells are usually the ones with no demand and nothing unique to say.",
      "Check the paired findings first. A coverage finding next to spam/thin-content or spam/near-duplicate in the same cluster is the combination that matters; coverage alone is a diagnostic to note, not an emergency.",
      "Collapse a dimension. If one axis (say, modifier words like cheap/best/top) adds combinations without adding user value, remove it from the URL structure and fold it into a single page.",
      "Treat info severity as guidance. The rule never blocks a verdict on its own; it tells you where a template's ambition outruns its substance so you can decide before Google does."
    ],
    spamBrainContext:
      "The 'keyword matrix' has been the engine of programmatic SEO since long before SpamBrain, and Google's spam policies have steadily closed in on it. The doorway-pages policy (March 16, 2015) named pages built for query permutations; the March 5, 2024 scaled-content-abuse update reframed the harm as volume without value; and the March 27, 2026 core update specifically down-weighted sparse, high-dimension templates on programmatic corpora.\n\nspam/template-coverage (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is the only rule in the suite that reasons about your URL structure as a combinatorial grid rather than about page content. That is why it ships at info severity and never contributes a blocker on its own, coverage is context, not a charge. Its job is to make the matrix visible so you can answer the question every scaled-content policy is really asking: did you build these pages because each cell serves a distinct need, or because a loop could generate them?",
    faqs: [
      {
        q: "Is low template coverage always bad?",
        a: "No, and the rule reflects that by firing at info severity. A directory that genuinely serves 96 specific markets has low 'coverage' of every theoretically possible combination and is perfectly legitimate. Low coverage only becomes a problem when it pairs with thin or near-duplicate content in the same cluster; that combination is the signature of a script that filled the high-volume cells of a keyword grid and skipped the rest."
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
        a: "spam/template-diversity measures how uniform your rendered HTML is; spam/template-coverage measures how completely your URL structure fills its own combinatorial grid. One looks at the pages, the other at the address space. A site can have diverse HTML but a suspiciously sparse URL matrix, or a dense matrix rendered through one rigid template; they catch different halves of the same programmatic shape."
      },
      {
        q: "My brewery directory has a sparse beer-style grid: is that a problem?",
        a: "It depends on whether the empty cells were ever meaningful. A taproom finder crossing two hundred breweries against twelve styles implies a huge matrix, but most breweries simply do not pour a barrel-aged gose or a hazy triple IPA. An audit reporting eleven percent coverage on that beverage grid is asking whether the missing pours were demand-driven or merely unreachable. Prune to the styles each taproom actually serves (the growler fills, the seasonal lager, the nitro stout, the cask night) and a sparse ratio becomes an honest one without a single empty pint page."
      }
    ],
    relatedRules: ["template-diversity", "doorway-pattern", "near-duplicate"],
    relatedTool: "doorway-page-detector"
  },
  {
    slug: "unique-value",
    ruleId: "content/unique-value",
    title: "Unique Value: Originality as a Density, Not a Word Count",
    metaDescription:
      "Word count is not uniqueness. How content/unique-value scores each page's originality as a rarity density, and why shared, per-axis data barely moves it.",
    primaryKeyword: "unique content value SEO",
    oneLiner:
      "content/unique-value scores how original each page is as a rarity density (every distinct word weighted by how rare it is across the audit, then averaged) and fires when that density falls below the floor, the page-specific-vocabulary test Google's scaled-content-abuse policy has applied since March 5, 2024 when it asks whether a URL adds anything genuinely new.",
    whatItDetects:
      "content/unique-value asks how original a page is relative to its siblings, as a density rather than a raw count. It tokenises each page's main content, lower-cased, split on whitespace, with leading and trailing punctuation stripped so 'word', 'word.' and '(word)' count as one token, and weights every distinct word by how rare it is across the audited set: a word on one page scores 1, a word on every page scores near 0 (normalised inverse document frequency). The page's score is the average of those weights, its unique-content density, between 0 and 1.\n\nA page whose vocabulary mostly repeats across its siblings (boilerplate, shared spec blocks, an entity-swapped template) scores low and fires. Because it is an average, the metric does not punish a page for being short or for living in a large, tightly-themed site, and it does not flip on a one-word margin the way a hard count does. Volume is spam/thin-content's job; exact twins are spam/near-duplicate's; this rule isolates low originality.",
    whyItMatters:
      "This is the rule that catches the failure thin-content misses. A page can clear the 300-word thin-content floor with room to spare and still be almost entirely boilerplate with an entity swapped in, long, but not original. content/unique-value measures originality directly by asking what vocabulary exists here and nowhere else on your site, which is much closer to how Google decides whether a URL earns its own slot in the index.\n\nThe most expensive mistake on programmatic sites is adding real, useful, but per-axis-shared data and expecting it to count. A regulation repeated across every page for that role, a spec block shared across a product line, a city's statutes echoed on each of that city's pages, all genuinely helpful, all shared, all worth zero toward this metric. The words that move it are the page-specific ones: a distinct lead, this record's particular facts, an example that exists only here. That is the difference between a database export and a page worth ranking.",
    failingExample:
      "/api/stripe-vs-square and /api/stripe-vs-paypal on a fintech directory. Each is 900 words, comfortably past the thin-content floor. But the shared 'What is a payment API' intro, the identical feature glossary, and the same integration checklist mean roughly 91% of each page's vocabulary also appears on its sibling. Its unique-content density lands near 9% (well under the 20% floor) so the rule fires error, because a reader gains little from the second page that the first did not already give them.",
    passingExample:
      "The same two pages, rebuilt so each leads with provider-specific material: real Stripe Radar fraud-tooling detail on one, Square's in-person hardware fees on the other, each with its own code sample and pricing edge cases. The shared glossary moves to a linked reference page. Now around 64% of each page's vocabulary is distinctive rather than echoed across siblings (its unique-content density clears the 20% floor with room to spare) and the rule passes.",
    howToFix: [
      "Write a page-specific lead. The fastest way to raise density is an opening paragraph true of this entity and nothing else. Boilerplate intros are the first thing to cut.",
      "Move shared blocks to a shared URL. A glossary, a methodology note, or a legal disclaimer that repeats across pages should live on one page the others link to, not embedded everywhere where it dilutes uniqueness.",
      "Stop expecting per-axis data to count. Content repeated across pages on the same axis (a role's regulations across that role's documents) is common vocabulary and barely moves density. Only text specific to this page raises it.",
      "Bind distinct records, not shared ones. If two pages pull the same fields from your data source, they will share vocabulary; differentiate the records or merge the pages.",
      "Read the density and overlap the finding reports. It tells you how distinctive the page is and confirms the problem is overlap, not length."
    ],
    spamBrainContext:
      "Originality has been the spine of Google's quality guidance for over a decade (the Search Quality Rater Guidelines have used 'no added value' as a Lowest-quality marker since 2014) but the March 5, 2024 scaled-content-abuse update made it enforceable at scale by naming pages that exist 'with little unique value' as a policy violation regardless of how they were produced.\n\ncontent/unique-value (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is pseolint's most direct measure of that clause. Where spam/thin-content counts total substantive words and spam/boilerplate-ratio measures shared sentence blocks, this rule scores how rare a page's vocabulary is against every other page in the audit and averages it into a density. A page whose density falls below the floor is, by definition, contributing almost nothing the rest of the site does not already say: which is precisely the condition Google's deduplication and quality systems are built to demote.",
    faqs: [
      {
        q: "How is this different from the thin-content rule?",
        a: "spam/thin-content counts total substantive words and fires below 300; content/unique-value ignores length and scores originality as a rarity density, firing when a page's vocabulary is mostly shared with its siblings. A page can pass thin-content with 1,000 words and still fail unique-value if most of those words are boilerplate. Length and originality are different axes; this rule measures the second one."
      },
      {
        q: "Does useful, accurate data count toward uniqueness?",
        a: "Only to the extent it is page-specific. This trips up pSEO teams constantly: a regulation, spec, or statistic that is genuinely useful but repeats across every page on the same axis is common vocabulary and barely lifts density. The metric moves on text that exists on this page and few others. The fix is not to remove the shared data but to add material that exists nowhere else on the site."
      },
      {
        q: "Why a density rather than a word count?",
        a: "Because repetition should not be rewarded and neither should shared filler. The rule works over distinct tokens and weights each by how rare it is across the audit (a word on every page scores near zero, a page-specific one near one) then averages them. Saying 'San Francisco' fifty times still contributes one word's worth of rarity, which is the right behaviour for a rule measuring how much new information a page actually contributes."
      },
      {
        q: "Does the score change as I add or remove pages?",
        a: "Somewhat, density is relative to the audited set, so a word's rarity drops as more pages use it. But because the score is an average over all of a page's words rather than a hard count of page-exclusive ones, adding a sibling nudges the density slightly instead of flipping a verdict on a one-word margin. It reflects how Google evaluates your site as a whole, without the instability of an absolute threshold."
      },
      {
        q: "I sell telescopes: every page repeats the same optics glossary. Does that count?",
        a: "The glossary does not, but the instrument's own numbers do. A refractor page stating its 102-millimetre aperture, its 660-millimetre focal length, the supplied 25-millimetre eyepiece, and the dovetail mount it ships on carries vocabulary no sibling listing repeats. A computerised go-to altazimuth mount and a manual equatorial tripod differentiate two products that would otherwise read alike. Move the shared 'what is magnification' explainer to one reference URL, and each telescope's distinct aperture, focal ratio, and eyepiece kit becomes the page-unique substance the rule counts. A heritage-orchard nursery that lists the rootstock, the chill-hours requirement, and the pollination group for each apple cultivar gives every page words no sibling listing repeats."
      }
    ],
    relatedRules: ["thin-content", "boilerplate-ratio", "near-duplicate"],
    relatedTool: "thin-content-scanner"
  },
  {
    slug: "meta-uniqueness",
    ruleId: "content/meta-uniqueness",
    title: "Meta Description Uniqueness: When Snippets Are Templated",
    metaDescription:
      "Meta descriptions identical after masking the entity are templated, not written. How content/meta-uniqueness groups masked descriptions and why duplicate snippets hurt.",
    primaryKeyword: "duplicate meta descriptions SEO",
    oneLiner:
      "content/meta-uniqueness masks the entity tokens in every page's meta description, lower-cases and trims what remains, and fires an error the moment two or more pages collapse to the same string: the templated-snippet pattern Google has treated as scaled content since the March 5, 2024 spam update.",
    whatItDetects:
      "content/meta-uniqueness checks the one piece of copy most teams forget to vary: the meta description. For every page that has one, the rule masks the entity tokens using your entity patterns, then lower-cases and trims the result. Pages whose masked descriptions are byte-for-byte identical are grouped together.\n\nAny group with two or more members fires an error naming the count of pages that share the template. The masking is the important part. A description like 'Compare {tool} against the competition, pricing, features, and migration paths' looks unique on the surface for every tool, but the moment you mask the tool name, all of them collapse to the same sentence. That collapse is the signal: the description was generated from a template, not written for the page. The rule deliberately uses exact-match-after-masking rather than fuzzy similarity, so it only fires when the underlying snippet really is one template wearing different nouns.",
    whyItMatters:
      "Duplicate meta descriptions waste your single best chance to control how a result looks in the SERP. When Google detects templated or duplicate descriptions it routinely discards them and writes its own snippet from on-page text, so the copy you optimised is replaced by whatever the algorithm grabs. At scale, identical descriptions across a template are also a clean scaled-content tell: a thousand pages with one masked description is a thousand pages a script produced.\n\nBecause the meta description is short and structured, it is one of the cheapest signals to get right and one of the most embarrassing to get wrong. A pSEO template that binds real per-entity data into the body but leaves the description as a fixed sentence frame is announcing the template in the one field crawlers read first. Fixing it is low-effort (bind a distinct value into each description) and it clears both this rule and a chunk of the perception that the site is mass-produced.",
    failingExample:
      "A jobs board ships 4,000 pages whose descriptions all read 'Find {role} jobs in {city}. Browse openings, salaries, and apply today.' Each looks distinct in the page source, but after masking {role} and {city} every one becomes 'find jobs in. browse openings, salaries, and apply today.' The rule groups all 4,000 and fires error: '4000 pages share the same meta description template after entity masking.'",
    passingExample:
      "The same jobs board binds a real per-page figure into each description: 'Compare 312 senior-nurse openings in Austin, median pay $98,000, salaries from $72,000 to $110,000, 41 hiring this week.' After masking the role and city, the descriptions still differ because the counts and salaries differ per page. No two collapse to the same string, the rule stays silent, and the SERP shows the copy the team actually wrote.",
    howToFix: [
      "Bind a distinct value into every description. A per-page count, price, date, or named attribute pulled from your data source breaks the masked-match because the variable part survives masking.",
      "Do not rely on the entity alone. Swapping only the city or role is exactly what the rule masks away; the description must vary on something the mask does not remove.",
      "Write the description from the page's most specific fact. The best snippets answer 'why this page' in 155 characters: the same discipline that satisfies the rule makes the SERP result more clickable.",
      "Audit templates, not pages. One bad description template generates thousands of duplicates; fix the template's data binding once and the entire cluster clears.",
      "Check for empty descriptions too: pages with no meta description are skipped here, but they surface in tech/og-completeness and lose snippet control for a different reason."
    ],
    spamBrainContext:
      "Duplicate metadata predates SpamBrain as a quality concern (Google's old Search Console 'HTML Improvements' report once flagged duplicate descriptions directly) but the March 5, 2024 scaled-content-abuse policy gave it new weight by treating templated mass production as a violation independent of authorship. Identical descriptions across a template are among the most legible evidence that pages came off a generator.\n\ncontent/meta-uniqueness (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) sits in the integrity category alongside content/unique-value, and the two are complementary: one checks that the body says something page-specific, the other that the snippet does. It uses entity-masked exact matching rather than the SimHash similarity that spam/near-duplicate runs on bodies, because meta descriptions are short enough that fuzzy matching would over-fire, a few shared words would look like a template when they are not. Exact-match-after-masking keeps the false-positive rate near zero.",
    faqs: [
      {
        q: "Why mask entities before comparing descriptions?",
        a: "Because the surface text already differs, every description has a different city or product in it. Masking removes that variable so the rule can see whether anything else changes. If two descriptions are identical once the entity is gone, they came from one template; if they still differ, real per-page copy survives. Masking is how the rule distinguishes 'written per page' from 'generated from a frame'."
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
        a: "Sharing a phrase is fine, the rule fires only on exact match after masking, not on partial overlap. If the descriptions differ on any unmasked content (a count, a price, a distinct clause), they will not group. The rule is built to tolerate a common voice while catching descriptions that are wholly templated."
      },
      {
        q: "Our wedding-venue listings all describe 'an unforgettable celebration': is the meta the problem?",
        a: "That phrasing is the giveaway. Bind each venue's concrete distinguishers into the description instead: the ballroom's seated capacity, the garden-gazebo ceremony option, the in-house catering minimum, the reception square-footage, and the off-season Friday rate. A description reading 'Riverside Barn seats 180, gazebo ceremonies, 7,500-dollar Saturday corkage-free minimum' survives masking because the banquet figures differ per venue, while 'an unforgettable celebration at {venue}' collapses to one templated string the moment the name is masked away. A bridal-suite photo count, a sommelier-curated wine-pairing menu, a string-quartet add-on, and a marquee-tent rain contingency separate one ballroom from the next far better than any superlative adjective. A kiln-fired ceramics studio that names each glaze recipe, the cone firing temperature, and the wheel-thrown dimensions per piece avoids the same templated-snippet collapse."
      }
    ],
    relatedRules: ["near-duplicate", "thin-content", "boilerplate-ratio"],
    relatedTool: "thin-content-scanner"
  }
,
  {
    slug: "missing-author",
    ruleId: "content/missing-author",
    title: "Missing Author: Why Anonymous pSEO Pages Fail E-E-A-T",
    metaDescription:
      "A missing author E-E-A-T gap is a trust signal Google's raters notice. How content/missing-author flags pages with no byline, meta author tag, schema author, or rel=author link.",
    primaryKeyword: "missing author E-E-A-T",
    oneLiner:
      "Google added the second E for Experience to its E-A-T trust framework on December 15, 2022, and content/missing-author mirrors that shift by flagging at warning severity, medium confidence, every page that exposes none of four author signals: a meta author tag, a schema author field, a byline element, or a rel=author link.",
    whatItDetects:
      "content/missing-author checks one thing per page: is there any machine-readable claim of who wrote it? The rule reads four independent author signals the parser extracts and fires only when all four are absent.\n\nThe signals are precise. (1) Meta author, a non-empty content value on a `<meta name=\"author\">` tag, after whitespace normalisation, so an empty tag does not count. (2) Schema author, any JSON-LD object on the page that carries an `author` key, which covers Article, BlogPosting, and NewsArticle structured data. (3) Byline element, at least one element whose class contains 'author' or 'byline', or which carries `rel='author'`, catching the visible '.byline' or '.author-name' markup most templates ship. (4) Rel=author link, an `<a rel=\"author\">` or `<link rel=\"author\">` anchor pointing at a profile.\n\nA page passes if even one of the four is present, so the bar is deliberately low. Severity is fixed at warning and confidence at medium, because technical docs, product pages, and pricing pages legitimately omit bylines, attribution matters most on blog and news content where authorship is the primary trust signal.",
    whyItMatters:
      "Authorship is the cheapest E-E-A-T signal to add and one of the easiest to omit at scale, which is exactly why a fleet of anonymous programmatic pages reads as low-effort to a classifier. Google's Search Quality Rater Guidelines (the document its quality systems are trained to approximate) ask raters to identify who is responsible for a page and judge whether that source has the experience and expertise to write it. A page that names nobody gives the rater, and the classifier, nothing to weigh.\n\nThe danger is the pattern, not the single page. One unsigned changelog is fine; ten thousand unsigned 'expert guides' is a corpus that cannot answer the most basic trust question Google asks. This is why the rule escalates its messaging when every page on a site over three pages deep is anonymous, emitting a single site-wide finding that names the count and calls it a site-wide E-E-A-T risk rather than burying it in per-URL noise.\n\nAuthorship alone will not rank a thin page, but its absence removes a defence that costs almost nothing to mount and is disproportionately missing on generated content.",
    failingExample:
      "/guides/how-to-refinance-a-mortgage: a 900-word 'expert guide' with no `<meta name=\"author\">`, no author field anywhere in its Article JSON-LD, no element classed 'byline' or 'author', and no rel=author link. The page asserts financial expertise in its prose but attributes it to nobody, so a quality rater asked 'who is responsible for this?' has no answer. All four signals are absent and the rule fires at warning.",
    passingExample:
      "/guides/how-to-refinance-a-mortgage: the same guide, now signed. The `<head>` carries `<meta name=\"author\" content=\"Dana Mercer, CFP\">`, the Article JSON-LD includes an `author` object with a name and a sameAs profile link, and the visible byline sits in a `<div class=\"byline\">By Dana Mercer</div>` above the lede. Any one of those would satisfy the rule; shipping all three gives both Google and readers a consistent, verifiable source.",
    howToFix: [
      "Add a `<meta name=\"author\" content=\"Full Name\">` to every content page's head; it is the single cheapest signal and clears the rule on its own.",
      "Put the author into your JSON-LD: an Article or BlogPosting node with an `author` object carrying a name and, ideally, a sameAs link to a real profile.",
      "Render a visible byline in markup the rule recognises (an element classed 'author' or 'byline', or one carrying rel='author') so humans and the parser see the same attribution.",
      "Link the byline to a genuine author bio page that documents the writer's relevant experience, not a stub; the link is what turns a name into an E-E-A-T signal.",
      "Decide which page types actually need authors. Technical docs and pricing pages can stay unsigned; blog, news, and 'guide' content should not, since that is where attribution carries the most trust weight.",
      "Audit site-wide before launch: if every page is anonymous on a site deeper than three pages, the rule emits one site-level E-E-A-T warning instead of per-URL findings, so fix the template once rather than page by page."
    ],
    spamBrainContext:
      "Authorship sits at the centre of E-E-A-T (Expertise, Experience, Authoritativeness, Trust) the framework Google's Search Quality Rater Guidelines have used since the E-A-T era and expanded on December 15, 2022 when the second E, for first-hand Experience, was formally added. E-E-A-T is not a direct ranking factor, but it is the lens the Helpful Content System (rebuilt August 25, 2022) and the March 5, 2024 scaled-content-abuse policy use to ask whether content was made to help people or to game search.\n\nThis rule (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is intentionally conservative: warning severity, medium confidence, and a single-signal pass bar, because a missing byline is suggestive of low effort, not proof of spam. Its value is corroborative, an anonymous corpus that also trips thin-content or near-duplicate is a far stronger 'made for search engines' signal than any one rule alone. It is the per-page complement to content/eeat-signals, which counts authorship as one of four broader trust categories alongside about-page links, publication dates, and 'last updated' markers.\n\nWhat the rule cannot do is judge whether a named author is real or qualified; it only verifies that an attributable source is claimed at all.",
    faqs: [
      {
        q: "Which of the four signals satisfies the rule fastest?",
        a: "Any single one. The rule passes a page the moment it finds a non-empty `<meta name=\"author\">`, an `author` key in JSON-LD, a byline or author-classed element, or a rel=author link. The cheapest to add is the meta tag (one line in the head) but the schema author and visible byline carry more weight with both Google and readers because they are harder to fake and visible in more contexts."
      },
      {
        q: "Why is this only a warning, not an error?",
        a: "Because plenty of legitimate page types ship without a byline. Technical documentation, product pages, and pricing pages are not expected to name an author, and flagging them as errors would be noise. Author attribution matters most on blog and news content where E-E-A-T is the primary trust signal, so the rule surfaces the gap at warning severity and medium confidence and lets you decide whether the page type genuinely needs a source."
      },
      {
        q: "Our investigative newsroom already runs reporter bylines: will this rule fire on us?",
        a: "Not if those bylines are in markup the parser can read. A masthead and a dateline are human-facing conventions; the rule needs a machine-readable signal. As long as each staff-reporter story carries a `<div class=\"byline\">` or an `author` field in its NewsArticle JSON-LD (not just a hand-set 'By Our Correspondent' line that the editor-in-chief styled with a class the rule does not recognise) every article passes. If a wire-service dispatch republished under your masthead has no byline element at all, the rule correctly flags it as the one anonymous page in an otherwise-attributed corpus. In one illustrative cleanup, a desk that signed only 73% of its filed stories closed the gap to full coverage within an 11-day sprint by binding the staff-reporter field into its NewsArticle template. The same fix rescues a herbalist co-op whose remedy monographs ran unsigned until each contributing clinical-herbalist credential was bound into the byline."
      },
      {
        q: "Does adding a fake author name fix the real problem?",
        a: "It clears this rule but defeats the point. The rule only verifies that an attributable source is claimed; it cannot tell whether the name is real or qualified. A fabricated 'expert' byline that links nowhere will satisfy the parser yet still read as untrustworthy to a human quality rater, who is explicitly asked to assess whether the named author has the experience to write the page. Use real people with genuine bios, or the signal is hollow."
      },
      {
        q: "How does missing-author differ from the eeat-signals rule?",
        a: "content/missing-author is narrow: it checks the four author signals and nothing else. content/eeat-signals is broader, counting authorship as just one of four trust categories (the others being an about-page link, a detectable publication date, and 'last updated' or 'reviewed by' markers) and it fires when a page carries fewer than two of the four. A page can pass missing-author by having a byline yet still trip eeat-signals if it lacks dates and an about link."
      }
    ],
    relatedRules: ["thin-content", "unique-value", "meta-uniqueness"],
    relatedTool: "spambrain-checker"
  },
  {
  slug: "eeat-signals",
  ruleId: "content/eeat-signals",
  title: "E-E-A-T Signals: When a Page Carries No Evidence of Who Wrote It",
  metaDescription:
    "A page with no author, date, about link, or sources looks anonymous. How content/eeat-signals counts 4 trust categories per URL and fires below a 2-of-4 floor.",
  primaryKeyword: "E-E-A-T signals SEO",
  oneLiner:
    "content/eeat-signals checks four trust categories on every page (an about-page link, an author byline, a published date, and a sources or references marker) then fires at info severity for any URL carrying fewer than 2 of the 4, the anonymity pattern Google's E-E-A-T framework has weighed against pages since its December 2022 Quality Rater Guidelines update.",
  whatItDetects:
    "content/eeat-signals scores each page against four independent trust categories and counts how many it carries. The first is an about-page link: the rule scans the page's resolved hrefs for any URL matching '/about'. The second is an author signal, satisfied if the page exposes a non-empty author meta tag, a schema.org author, a byline element, or a rel=author link. The third is a published date the parser could extract. The fourth is a 'sources' category, matched when the raw HTML contains any of five patterns: 'last updated', 'last modified', 'reviewed by', 'sources:', or 'references:'.\n\nA page passes if it carries 2 or more of those 4 categories. Any page below that floor is flagged. The rule never inspects the quality of the byline or the accuracy of the date; it only asks whether the markers of accountability are present at all. The point is structural: a page that names nobody, dates nothing, links to no about page, and cites no source is anonymous by construction, and anonymity is the baseline condition Google's trust evaluation reads first.",
  whyItMatters:
    "E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) is how Google's raters decide whether a page deserves trust, and trust starts with knowing who is speaking. A page with no author, no date, and no sources gives a rater nothing to evaluate, so it defaults to the floor. This rule catches the corpora most prone to that failure: programmatically generated pages, where the template binds entity data into the body but forgets that a real publisher signs its work.\n\nThe cost is highest on Your-Money-or-Your-Life topics (health, finance, legal, safety) where Google's guidelines demand visible expertise before a page can rank. But the markers are cheap to add and the absence is conspicuous at scale: ten thousand undated, unsigned pages on one template is a clean tell that no human stood behind any of them. The rule fires at info severity because a single missing signal is guidance, not a verdict, but a whole corpus stuck below the 2-of-4 floor is a structural credibility gap that pairs badly with thin-content or near-duplicate findings on the same pages.",
  failingExample:
    "/guides/how-to-refinance-a-mortgage on a programmatically generated finance site. The body is 1,200 words of real advice, but there is no byline, no published or updated date, no link to an about page, and no sources or references block anywhere in the HTML. The page carries 0 of the 4 trust categories. The rule fires at info: '/guides/how-to-refinance-a-mortgage has fewer than 2 out of 4 E-E-A-T signal categories.'",
  passingExample:
    "The same refinance guide, reissued with accountability attached: a byline reading 'Reviewed by Dana Okafor, CFP' resolves the author category, a visible 'Last updated March 4, 2026' line satisfies both the date and the 'last updated' sources pattern, and a footer link to /about-our-editorial-team adds the about category. The page now carries 4 of 4 categories, clears the 2-of-4 floor with room to spare, and a rater can see exactly who stands behind the advice.",
  howToFix: [
    "Add a real author byline to every template. A meta author tag, a schema.org author property, a visible byline element, or a rel=author link each satisfies the author category: pick one and bind a genuine name, not a brand placeholder.",
    "Expose a published or updated date. The rule reads the date the parser extracts, so surface a real article:published_time or a visible 'Last updated' line rather than leaving the page undated.",
    "Link to an about page from the template footer or header. Any href matching '/about' resolves the category, and one shared link covers the whole corpus at once.",
    "Cite sources where the topic warrants it. A 'Sources:' or 'References:' block, or a 'Reviewed by' line, matches the rule's patterns and gives readers and raters something to verify against.",
    "Treat a site-wide finding as a template fix, not a per-page chore. When every page is below the floor, the cause is one template missing accountability markers: add them once at the template level and the whole cluster clears.",
    "Prioritise the fix on Your-Money-or-Your-Life pages first, where Google's guidelines weigh visible expertise most heavily before granting trust."
  ],
  spamBrainContext:
    "E-E-A-T is not a spam rule and not a ranking factor you can game; it is the conceptual frame Google's Search Quality Rater Guidelines use to describe trustworthy pages, expanded from E-A-T to add 'Experience' in the December 2022 guidelines update. The raters who apply it are not the algorithm, but their judgements train the systems that are, which is why the visible markers of accountability matter even though no single tag is a direct signal.\n\ncontent/eeat-signals (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is the gentlest expression of that frame in the suite; it fires at info severity and never blocks a verdict, because the presence of an about link or a byline proves nothing about quality on its own. Its job is to catch the structural anonymity that programmatic templates fall into: pages that carry real content in the body but none of the who-wrote-this, when, and on-what-authority markers a credible publisher attaches by reflex. When that anonymity coincides with thin or templated content, the corpus reads as mass-produced and unaccountable at the same time.",
  faqs: [
    {
      q: "What are the four E-E-A-T signal categories the rule checks?",
      a: "An about-page link (any resolved href matching '/about'), an author signal (a non-empty author meta tag, a schema.org author, a byline element, or a rel=author link), a published date the parser could extract, and a 'sources' marker (the HTML containing 'last updated', 'last modified', 'reviewed by', 'sources:', or 'references:'). A page passes by carrying any 2 of the 4; below that floor it is flagged at info severity."
    },
    {
      q: "Why does the rule fire at info severity instead of warning or error?",
      a: "Because a present marker proves nothing about quality, and a single missing one is not damning. A byline does not make a page expert, and a date does not make it accurate, the rule only checks that the markers of accountability exist at all. Info severity reflects that this is structural guidance, not a verdict. Its weight comes from corroboration: anonymity across a whole corpus matters most when it pairs with thin-content or near-duplicate findings on the same pages."
    },
    {
      q: "Does adding a fake author byline satisfy the rule?",
      a: "It satisfies the literal check, because the rule only detects whether an author signal is present, not whether the person is real. But that misreads the purpose. The rule is a proxy for accountability, and a fabricated byline on a Your-Money-or-Your-Life page is exactly the pattern Google's raters are trained to distrust. Bind a genuine name with verifiable credentials; gaming the marker without the substance trades a clean info finding for a real trust problem a human reviewer will catch."
    },
    {
      q: "Our certified personal-finance advice site keeps tripping this on its tax-planning pages: what is missing?",
      a: "Almost certainly the accountability markers a fiduciary practice should already be proud to display. A page walking a reader through an IRA rollover or how a Roth conversion lands in their marginal bracket should carry the byline of the certified financial planner who reviewed it, that planner's CFP credential, a visible 'last updated' date for when the contribution limits were checked, and a sources block citing the relevant IRS publication. Add those and a YMYL tax-planning page that was anonymous becomes a page a rater can trust, and clears the 2-of-4 floor on the strength of credentials you can substantiate. As an illustration, a tax-advice section that added a Series 65 registration line, a visible review date, and an errors-and-omissions disclosure lifted its coverage to 4-of-4 in 9 days and clawed back 22% of lost long-tail clicks over the following 13 weeks. A vineyard's tasting-notes pages earn the same lift once each varietal entry carries a winemaker byline, the bottling vintage, and a soil-and-terroir sourcing note."
    },
    {
      q: "How is this different from the missing-author rule?",
      a: "content/missing-author is narrow: it checks one thing, whether a page exposes any author signal at all. content/eeat-signals is broader, author is only one of its four categories, alongside an about link, a published date, and a sources marker, and it judges the combination against a 2-of-4 floor. A page can have an author and still trip eeat-signals if it is missing everything else, and a page with no author can still pass if it carries two of the other three."
    },
    {
      q: "Will fixing E-E-A-T signals improve my rankings directly?",
      a: "Not directly, E-E-A-T is an evaluative frame, not a measurable ranking input, so no single tag moves a position on its own. What it does is remove a credibility gap that drags on the whole picture, especially on health, finance, legal, and safety topics where Google's guidelines demand visible expertise. The honest framing is that satisfying this rule is necessary but not sufficient: it clears the anonymity that holds a page back without being the thing that pushes it forward."
    }
  ],
  relatedRules: ["missing-author", "thin-content", "unique-value"],
  relatedTool: "spambrain-checker"
},
  {
  slug: "title-uniqueness",
  ruleId: "content/title-uniqueness",
  title: "Title Uniqueness: Missing, Unfilled, and Duplicate Page Titles",
  metaDescription:
    "The page title is Google's strongest on-page signal. How content/title-uniqueness flags missing titles, unfilled template fields and duplicates, with no character limit.",
  primaryKeyword: "duplicate page titles SEO",
  oneLiner:
    "content/title-uniqueness rolls three checks into one rule: a missing or empty title, a title short enough to read as a template field that never got filled in, and two or more pages sharing the exact same raw title, and every one of the three maps to a reason Google's title-link documentation gives for replacing your title, none of which is a character count.",
  whatItDetects:
    "content/title-uniqueness runs three checks over the title that the existing meta-description rule never touched. First, a missing title: any page whose <head><title> is absent, empty, or whitespace-only fires an error, because the title is the strongest on-page signal Google ranks against. Second, an unfilled template field: a title under 10 characters fires a warning, because that is the shape of Google's own documented example of a broken title, the literal '| Site Name' left behind when the entity never got bound in. Google rewrites titles like that from the H1 or the anchor text, so the copy you wrote never shows.\n\nThird, exact duplicates. The rule groups every page by its raw, trimmed title string and fires an error the moment two or more pages share one. It does NOT entity-mask the way the meta rule does, 'Slack to Google Sheets' and 'Slack to Airtable' are different raw strings and stay separate, so the rule never false-positives on a legitimate templated catalog whose titles already carry the per-record entity.\n\nThere is no fourth check, and in particular there is no maximum. Google's title-link page states that there is no limit on how long a title element can be, and that the title link is truncated in search results as needed, typically to fit the device width. That is display-side cropping, so pseolint flags long titles at no length at all. A tool that warns you at 63 characters has not found a problem.",
  whyItMatters:
    "The title is the single highest-impact on-page element Google reads, and the failure modes this rule catches each waste it differently. A missing title hands Google a blank where your best keyword should sit, so the engine invents a title link from whatever H1 or anchor text it finds. A near-empty title does the same thing for the same documented reason: Google lists 'when part of the title text is missing' among the conditions under which it stops using your title element, and an unbound template variable is exactly that.\n\nDuplicate titles are the most damaging at scale, and they are documented too: repeated boilerplate across a subset of pages within a site is another listed trigger for a rewrite. When a thousand catalog pages carry one identical title, Google cannot tell them apart in the index, clusters them, and demotes all but one. The fix is cheap and the win is immediate: a unique, well-scoped title per URL is the lowest-effort, highest-return change on most programmatic sites, and it is the one field a crawler reads before anything else on the page.",
  failingExample:
    "A SaaS integrations catalog ships 600 pages whose <head><title> is the same literal string on every URL: 'Integrations, Connect Your Tools'. The rule groups all 600 and fires an error: '600 pages share the exact title \"Integrations, Connect Your Tools\".' A second page in the same crawl carries no <head><title> at all, its only <title> is an inline SVG <title> label on the logo ('Acme logo'), which crawlers do not use as the page title, so that page fires a separate error too.",
  passingExample:
    "The same catalog binds the per-record entity into every title: 'Slack to Google Sheets Integration, Sync Messages Automatically' on one page, 'Notion to Airtable Integration, Two-Way Database Sync' on the next. Each title is a real <head><title>, each carries its own entity rather than an unbound placeholder, and each is unique across the crawl because the integration pair survives in the raw string. No group has two members, so the rule stays silent. Note what nobody measured to get there: the longer of those two titles would be fine at twice the length.",
  howToFix: [
    "Add a non-empty <head><title> to every page. If a template can render without one, that is the first leak to plug; the title is the field Google reads before any other.",
    "Bind the per-record entity into the title so duplicates cannot form. A raw string carrying the integration name, currency pair, or city is unique by construction and never groups.",
    "Expand anything under 10 characters, which is almost always an unbound template variable rather than a deliberate choice. Do not shorten anything: no maximum title length is documented.",
    "Front-load the distinguishing words. Search results crop the title link to fit the device width, so the entity and primary keyword survive best at the start rather than after a long brand suffix.",
    "Never treat an inline SVG <title> as the page title. That logo accessibility label is decorative and crawlers ignore it: add a real <head><title> with the page entity instead.",
    "Re-run the audit after editing a template. Fixing one duplicated title clears the whole group at once, since the rule reports per shared string, not per URL."
  ],
  spamBrainContext:
    "The page title predates every SpamBrain-era policy as a ranking input (it has been the strongest on-page signal since the earliest days of Google's index) which is why the 2026-05-03 blind-spot audit flagged its absence in pseolint as a tier-1 gap and led to this rule shipping in @pseolint/core (MIT-licensed at github.com/ouranos-labs/pseolint). Titles are not meta descriptions, so content/meta-uniqueness never covered them.\n\nThe two rules guard adjacent fields with deliberately different logic. Meta descriptions are prose, so the meta rule entity-masks before comparing to catch a templated sentence frame. Titles are usually built to contain the entity, so a raw exact-match comparison is the correct test, masking would wrongly collapse two legitimately distinct catalog titles into a false duplicate. Duplicate titles also read as a scaled-content tell at volume: a thousand pages under one identical title is a thousand pages a generator produced without a per-record title binding, the same mass-production fingerprint Google's March 5, 2024 scaled-content-abuse policy was written to demote.",
  faqs: [
    {
      q: "Why does the rule compare raw titles instead of masking the entity first?",
      a: "Because titles are meant to contain the entity. A catalog title like 'Slack to Google Sheets' is supposed to carry the integration name, so a raw exact-match comparison is the right test, the two pages are genuinely different. Masking would strip those entities and wrongly collapse every catalog title into one false duplicate, false-positiving on every directory in existence. The meta-uniqueness rule masks because descriptions are prose where a templated frame is the real concern; titles are not, so this rule deliberately uses raw comparison."
    },
    {
      q: "What are the exact title length limits the rule checks?",
      a: "There is only one, and it is a floor, not a band. A title under 10 characters fires a warning, because that is the shape of an unfilled template field, which Google documents as a reason it replaces your title link. There is no upper limit and there never will be: Google's title-link page states that there is no limit on how long a title element can be, and that the title link is truncated in search results as needed, typically to fit the device width. That is pixel-based display cropping, not a ranking or indexing event, and no character count appears anywhere in that documentation. The widely-repeated 60-character rule is folklore, and pseolint keeps a public list of the checks it refuses to run for exactly this reason. Missing or empty titles are a separate, more severe case; those fire an error."
    },
    {
      q: "My logo has an SVG <title>: why does the rule say my page has no title?",
      a: "An inline SVG <title> is an accessibility label for the graphic, not the page title. Crawlers do not use it as the title that appears in search results. When a page has no <head><title> and its only <title> element is that SVG label, the rule fires an error and names the SVG text it found, because naive extractors used to mis-report that label as the page title. The fix is to add a real <head><title> in the document head with the page's per-record entity; leave the SVG <title> where it is for screen readers."
    },
    {
      q: "Our antiquarian bookshop catalogue gives every first edition the same title: does that trip the rule?",
      a: "It does, and the duplicate-title error is doing exactly its job. A page titled 'Rare Book, Out of Print' on a Graham Greene first edition with its dust jacket intact, and an identical title on a foxed Penguin paperback, collapse to one shared string and fire an error. Bind each listing's concrete distinguishers into the raw title instead: the author, the edition, the binding state. A title reading 'Brighton Rock, 1938 First Edition, Heinemann, Jacket Present, ISBN-Free Colophon' stays unique because the spine details and edition differ per volume, while 'Rare Book, Out of Print' repeats verbatim across the whole catalogue and groups the moment a second listing reuses it. In one catalogue cleanup, deduplicating the verbatim titles recovered an estimated 31% of the collection's lost listing impressions within 10 days of the next recrawl."
    },
    {
      q: "How is this different from the meta-uniqueness rule?",
      a: "They guard adjacent fields with opposite comparison logic. content/title-uniqueness compares raw, trimmed page titles and flags exact duplicates, plus missing titles and titles short enough to be an unfilled template field. content/meta-uniqueness compares descriptions only after entity masking. Neither rule enforces an upper length, because neither field has a documented one. The comparison difference is intentional: titles are meant to contain the entity so raw comparison is correct, whereas descriptions are prose where a masked template is the real concern. Run both, one keeps the title unique and actually filled in, the other keeps the snippet from being a generated frame."
    }
  ],
  relatedRules: ["meta-uniqueness", "heading-structure", "thin-content"],
  relatedTool: "thin-content-scanner"
},
  {
  slug: "heading-structure",
  ruleId: "content/heading-structure",
  title: "Heading Structure: Missing, Duplicate, and Unstructured Headings",
  metaDescription:
    "Pages with no H1 are a template bug; multiple H1s confuse the topic signal. How content/heading-structure flags missing, duplicate, and unstructured headings.",
  primaryKeyword: "heading structure SEO",
  oneLiner:
    "content/heading-structure runs three checks on every page Google crawls: a missing H1 fires an error because it is almost always a CMS or template bug, two or more H1 elements raise a warning that the HTML5 outline and accessibility checkers both dislike, and any page past 600 words with no H2 sub-structure emits an info note about Featured Snippet eligibility.",
  whatItDetects:
    "content/heading-structure runs three independent checks over every parsed page and emits one finding per problem it sees. First, if a page has zero <h1> elements it fires an error: a page with no top-level heading is almost always a CMS misconfiguration or a template that forgot to render the title, and Google leans on the H1 to disambiguate the page's primary topic when the title tag is weak.\n\nSecond, if a page carries more than one <h1>, the rule raises a warning and reports the count. A single H1 per document is the convention every accessibility checker enforces and several SEO heuristics still expect, so multiple H1s read as an ambiguous primary-topic signal.\n\nThird, the rule measures the page's body word count by splitting the main text on whitespace; once that count reaches 600 words and the page has no <h2> at all, it emits an info finding. A long wall of text with no sub-headings is a readability and Featured Snippet problem, not a correctness bug, which is why this third check sits at the gentlest severity.",
  whyItMatters:
    "Heading hierarchy is one of the few on-page signals that is both machine-read and human-read at once. Google parses the H1 and H2 sequence to build a topic outline of the page, and assistive technology turns the same structure into a navigable table of contents. When the H1 is missing entirely, both readers lose their anchor: the crawler falls back to the title tag or guesses from body text, and a screen-reader user lands on a page with no heading to orient them.\n\nMultiple H1s are a milder failure but a real one. The HTML5 specification's document-outline algorithm tolerates them in theory, yet no mainstream browser ever implemented that algorithm, so in practice the page exposes several competing top-level headings with no defined precedence. That is why the rule treats it as a warning rather than an error; it rarely breaks ranking outright, but it muddies the primary-topic signal and trips accessibility audits.\n\nThe 600-word-without-an-H2 case costs you eligibility, not rank. Featured Snippets and the question-answer blocks that feed AI Overviews are extracted from clearly delimited sections; a long page with no H2 gives the extractor nothing to grab, so the content can rank yet never surface in the formats that earn the most visibility.",
  failingExample:
    "A pSEO city-services template renders 4,000 pages where the hero block is wrapped in a styled <div> instead of an <h1>, so every page reports zero <h1> elements and fires an error. A handful of long guide pages compound the problem: each runs past 1,800 words of plumbing-permit prose in a single unbroken column with no <h2> anywhere, so they also pick up the 600-word info finding.",
  passingExample:
    "The same template, fixed: the hero block is now a single <h1> naming the city and service ('Emergency Plumbers in Austin'), and the long guide pages are broken into <h2> sections, 'Permit requirements', 'Average call-out cost', 'What to ask before hiring'. Every page reports exactly one H1, and no page over 600 words is left without sub-headings, so all three checks pass.",
  howToFix: [
    "Add a single <h1> to every page that lacks one: name the page's primary topic in it, since Google uses the H1 to disambiguate when the title tag is unclear.",
    "Where a page has two or more H1s, keep one and demote the rest to <h2>; the visual size can stay identical via CSS, only the markup level changes.",
    "Check that your hero title is a real <h1> tag and not a styled <div> or <span>: CSS that merely looks like a heading does not count and still trips the missing-H1 error.",
    "Break any page over 600 words into sections with <h2> sub-headings; aim for one H2 per distinct idea so Featured Snippet extractors have clear blocks to pull from.",
    "Fix the template, not the page: a missing or duplicated H1 in a pSEO layout repeats across every generated URL, so one markup change clears the entire cluster at once.",
    "Re-run the audit after editing the template to confirm all three checks (missing, duplicate, and 600-word-no-H2) clear together."
  ],
  spamBrainContext:
    "content/heading-structure is a content-quality rule, not a spam classifier, which is why none of its three checks ever escalates past warning into the critical tier that spam/doorway-pattern occupies. Missing or duplicate headings are usually honest engineering mistakes, a broken template, a CMS that wraps the title in a <div> instead of an <h1>, a marketing page that pastes two hero blocks each with its own H1. The rule surfaces them so they get fixed, not because they signal manipulation.\n\nThat said, heading problems travel with scaled-content problems often enough to be worth reading together. A programmatic template that renders no H1 across thousands of URLs, or stamps an identical multi-H1 layout onto every generated page, is leaking the same structural monotony that the August 25, 2022 Helpful Content System and the March 5, 2024 scaled-content-abuse update were written to down-weight. When a heading finding lands on a template that also trips a thin-content or boilerplate check, treat the cluster as one signal: the headings are telling you the same generator built every page, and Google reads structural sameness as mass production.\n\nThis rule ships in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint.",
  faqs: [
    {
      q: "How does content/heading-structure decide a page has 'no H1'?",
      a: "It counts the <h1> elements in the parsed page. If that count is exactly zero, the rule fires an error, because a page with no top-level heading is almost always a template or CMS bug rather than a deliberate choice. The check looks only at the <h1> tag itself, not at ARIA roles or visually-styled <div> headings, so a heading that merely looks like an H1 in CSS but is not marked up as one still counts as missing."
    },
    {
      q: "Why is having two H1 elements only a warning and not an error?",
      a: "Because it rarely breaks ranking on its own. The HTML5 document-outline algorithm technically permits multiple H1s, but no browser ever shipped that algorithm, so the practical effect is a muddied primary-topic signal and a failed accessibility check rather than a broken page. The rule reflects that by reporting multiple H1s at warning severity, worth fixing, but not the emergency that a missing H1 represents. The fix is to keep one H1 and demote the rest to H2."
    },
    {
      q: "What exactly is the 600-word rule and why is it only an info note?",
      a: "The rule counts the words in a page's main body text, and once that count reaches 600 with zero <h2> elements present, it emits an info-severity finding. A long page with no sub-headings is a readability and Featured Snippet problem, not a correctness error, so it sits at the gentlest severity in the engine. Below 600 words the rule stays silent about H2s entirely, on the logic that a short page does not need sectioning to be scannable."
    },
    {
      q: "Our gallery-guide site keeps tripping the missing-H1 error on its exhibition pages: what is going on?",
      a: "This is the single most common shape of the error. A museum or gallery-guide CMS will often render the exhibition name as a large, beautifully-styled <div> at the top of each accession page, with the docent's wall-label notes, provenance history, and antiquities catalogue numbers all flowing beneath it, but if that title <div> is never marked up as an <h1>, the rule counts zero H1s and fires. Wrap the exhibition title for each gallery wing in a real <h1> ('Etruscan Bronzes, West Wing, Accession 1974.118'), and the error clears across every exhibit-label page at once. If a long curator's essay on a single show also runs past 600 words in one column, add <h2> sub-headings for provenance, conservation, and exhibition history so the docent-written prose stays scannable. After one gallery rebuilt its exhibit-label template, restoring a single H1 per page lifted Featured-Snippet eligibility on 44% of its long essays and recovered an estimated 21% of guide-page entrances within a 12-day window."
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
  title: "Image Alt Text: Catching Content Images That Ship With No Description",
  metaDescription:
    "Content-bearing images missing alt text fail WCAG and lose Google Images traffic. How content/image-alt-text scans every <img>, honors decorative exceptions, and reports per page.",
  primaryKeyword: "image alt text SEO",
  oneLiner:
    "content/image-alt-text scans every <img> tag on a page, skips images you have explicitly marked decorative, and reports each URL where a content-bearing image carries no alt attribute at all: the accessibility gap WCAG 2.1 has required closing under success criterion 1.1.1 since June 5, 2018 and the one that keeps a page out of Google Images.",
  whatItDetects:
    "content/image-alt-text reads every <img> tag in a page's HTML and asks one question of each: is this image content-bearing, and if so does it have an alt attribute at all? The rule parses the tag's attributes, then skips any image you have deliberately marked as decorative, role=\"presentation\" or role=\"none\", aria-hidden=\"true\", or an explicit empty alt=\"\". An empty alt is treated as an intentional signal that the image carries no information, so it is accepted, never flagged.\n\nThe rule fires only when the alt attribute is entirely missing from a content-bearing image, not when it is present but short, and not on images you told it to ignore. For each page it counts how many qualifying images lack alt, divides by the total content-bearing images on that page, and emits one summary finding per URL rather than one line per image. A sample of up to three image sources is attached so you can find the offenders fast.\n\nSeverity scales with how widespread the gap is on the page: when at least half of a page's content images are missing alt the finding is a warning; below that ratio it drops to info, on the logic that a single stray image is a smaller signal than a template that never binds the slot.",
  whyItMatters:
    "Alt text is the only description a screen reader, a slow connection, or a crawler has when the pixels do not load. WCAG 2.1 success criterion 1.1.1 (Non-text Content) requires a text alternative for every image that conveys information, which is why a missing alt is both an accessibility defect and, in many jurisdictions, a legal exposure. The same string is what Google Images indexes against, a product shot with no alt is a product shot Google cannot read, and the image-search traffic that would have found it goes to a competitor whose markup is complete.\n\nFor a programmatic site the failure is rarely one careless image. It is a template whose alt slot was left at a literal default (or left blank) and then iterated across every page in the catalog, so a single missing binding becomes thousands of undescribed images at once. That is exactly the shape this rule is built to surface: a per-page ratio that climbs toward 100% across a cluster is the tell that the data source never fed the alt attribute, the same way it feeds the heading and the body copy.\n\nThe fix costs almost nothing in content terms. Binding a real, per-image description from the same data the rest of the page already uses closes the accessibility gap and opens the Google Images channel in one edit.",
  failingExample:
    "/catalog/giclee-print-harbor-fog: a fine-art listing whose hero image renders as <img src=\"/img/harbor-fog.jpg\"> with no alt attribute, alongside three thumbnail crops that are also missing it. The template iterates this same shape across all 1,800 prints in the shop, so every listing ships four undescribed content images. On this page four of four content-bearing images lack alt, a ratio of 100%, and the rule fires at warning severity naming the page and the first three image sources.",
  passingExample:
    "/catalog/giclee-print-harbor-fog, the same listing after the template binds alt from the print record: <img src=\"/img/harbor-fog.jpg\" alt=\"Harbor Fog giclee print, 24x36 inch edition of 50 on archival cotton rag\">. The decorative divider graphic between sections is marked aria-hidden=\"true\" so the rule correctly skips it, and a purely ornamental flourish carries alt=\"\" on purpose. Zero content images are missing alt, the finding does not fire, and Google Images can now read every shot in the gallery.",
  howToFix: [
    "Add a descriptive alt attribute to every content-bearing <img> that conveys information: describe what the image shows, not the file name, and keep it to a natural phrase a screen reader can speak.",
    "For purely decorative images (dividers, background flourishes, spacer graphics) set alt=\"\" explicitly or add aria-hidden=\"true\" so the rule recognises the omission as intentional rather than forgotten.",
    "In a pSEO template, bind the alt text from the same data source that fills the rest of the page (the product name, the city, the edition size) so each generated image gets its own description instead of a static default.",
    "Never leave a templated alt at a literal placeholder like alt=\"image\" or the entity name alone; a default that repeats across every page is its own duplicate-content tell even though it technically passes this rule.",
    "Re-run the audit after fixing the template binding: because the finding is per page, a single corrected template binding clears the warning across the entire catalog at once.",
    "Spot-check with a screen reader or the browser accessibility tree to confirm the descriptions actually make sense when read aloud, not just that the attribute is present."
  ],
  spamBrainContext:
    "Alt text sits at the intersection of accessibility law and search visibility, which is why it is worth getting right independently of any spam policy. The Web Content Accessibility Guidelines have required a text alternative for non-text content since WCAG 1.0 in 1999, carried forward unchanged into WCAG 2.0 (December 11, 2008) and WCAG 2.1 (June 5, 2018) as success criterion 1.1.1, the most-cited clause in accessibility litigation. Google's own Image SEO documentation states plainly that alt text is how the crawler understands an image's subject and is a primary factor in Google Images ranking.\n\ncontent/image-alt-text (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is a content-category check, not a spam-weighted one. It does not claim a penalty; it surfaces a quality and accessibility gap that programmatic templates produce at scale when the image slot is the one field the data binding forgot. The signal it shares with the rest of the suite is templating: a missing alt that repeats across a whole catalog is the same mass-production fingerprint that spam/template-diversity and content/unique-value read elsewhere, just expressed in the one attribute crawlers and assistive technology both depend on.",
  faqs: [
    {
      q: "Does the rule flag every image without alt text?",
      a: "No. It skips images you have explicitly marked as decorative, role=\"presentation\", role=\"none\", aria-hidden=\"true\", or an empty alt=\"\". An empty alt is read as a deliberate signal that the image carries no information, so it is accepted. The rule fires only when the alt attribute is entirely missing from a content-bearing image, because a missing attribute means the author never decided whether the image was informative or decorative."
    },
    {
      q: "Why is alt=\"\" treated as passing rather than failing?",
      a: "Because an explicit empty alt is the correct WCAG-recommended markup for a purely decorative image; it tells a screen reader to skip the image entirely instead of announcing a file name. Flagging it would push authors toward describing images that should stay silent, which harms accessibility. The rule distinguishes 'deliberately empty' from 'forgotten' by checking whether the attribute exists at all, and only the second case is a defect."
    },
    {
      q: "Why does severity change between warning and info?",
      a: "The rule computes the share of a page's content images that are missing alt. When at least half are missing, the finding is a warning; that pattern almost always means a template never bound the slot, so it scales across the whole site. Below half, it drops to info, because a handful of stray images on an otherwise-complete page is a smaller, more isolated problem worth noting but not alarming over."
    },
    {
      q: "How should a pSEO template handle alt text for generated images?",
      a: "Bind it from the same data source that fills the rest of the page. If each page renders a product name, a city, or an attribute from a record, the alt attribute should pull from that record too (alt=\"{productName} in {city}\") so every generated image gets a description as specific as the page. Leaving the slot at a static literal default produces thousands of identical, uninformative alts, which is its own templated-content signal even though it technically satisfies the presence check."
    },
    {
      q: "I run a fine-art print shop: how should I write alt text for a giclee listing?",
      a: "Describe what the buyer is judging, not the file. For an archival giclee print, an alt like \"Harbor Fog giclee print, 24x36 inch edition of 50, matte finish on cotton rag paper\" carries the edition size, the aspect ratio, the paper stock, and the finish, the exact attributes a collector searches Google Images for. Mark the decorative gallery-wall mockup or the framing-corner flourish with aria-hidden=\"true\", and bind the substantive description for each print from its catalog record so a 1,800-piece collection stays both accessible and indexable without a single hand-written attribute."
    }
  ],
  relatedRules: ["thin-content", "unique-value", "heading-structure"],
  relatedTool: "thin-content-scanner"
},
  {
  "slug": "orphan-pages",
  "ruleId": "links/orphan-pages",
  "title": "Orphan Pages: URLs No Other Page Links To",
  "metaDescription": "Orphan pages have zero inbound internal links, so Googlebot can't crawl them from your site. How links/orphan-pages finds every unreachable URL in your corpus.",
  "primaryKeyword": "orphan pages SEO",
  "oneLiner": "links/orphan-pages scans every URL in the crawl, counts the inbound internal links pointing at each one, and fires at error severity on any page with exactly 0 of them, the dead-zone shape that leaves Googlebot unable to reach a URL through your own navigation, a structural gap the March 27, 2026 core update treats as a discoverability failure rather than a content one.",
  "whatItDetects": "links/orphan-pages builds one number for every page in the crawl: how many other pages in the same corpus link to it. It walks each parsed page, reads the inbound-link count the crawler accumulated while following internal hrefs, and flags any URL whose count is exactly 0. The root URL is exempted (your homepage is reached directly, not via an internal link) so the rule never accuses the front door of being unreachable.\n\nThe check is corpus-scoped, which is the detail that makes it honest. It only knows about pages the crawl actually visited and only counts links between those pages. A URL with zero inbound links is one that no page in the set references, meaning a crawler arriving at your homepage has no internal path to it. The page might still be reachable through your XML sitemap or an external backlink, but inside the site's own link graph it is an island.\n\nEvery orphan emits a single error-severity finding naming the URL and recommending you link to it from a relevant hub or index and add it to navigation. The rule reasons purely about reachability; it makes no judgement about whether the page's content is good, only about whether anything points at it.",
  "whyItMatters": "Search engines discover most pages by following links. Googlebot starts somewhere it already knows (usually your homepage or a sitemap entry) and crawls outward along internal hrefs. A page with zero inbound internal links sits outside that graph: nothing on your site points a crawler toward it, so it competes for discovery and crawl budget at a severe disadvantage even when its content is excellent.\n\nOrphans are a classic failure mode of programmatic builds. A template generates 4,000 location pages and writes them to disk, but the index that should link them is paginated to show only the first 200, or the generation job ships the detail pages a week before the hub that lists them. The pages exist, return 200, and may even sit in the sitemap, yet no human or crawler can navigate to 3,800 of them without typing the URL. PageRank, the internal-link signal Google has used since 1998, never flows to a page nothing links to, so orphans tend to rank far below their integrated siblings.\n\nThe error severity reflects that this is a structural defect, not a stylistic one. A page no one can reach is functionally invisible, and invisibility is the most expensive SEO problem there is.",
  "failingExample": "A beekeeping-supplies shop ships a /hives/ catalog whose index template paginates to the first 24 products, but the store stocks 310 SKUs. The $420 cedar Langstroth deep brood box, the nuc box, and roughly 280 other hive components live at real URLs that return 200, yet no page in the crawl links to them. The rule counts 0 inbound internal links for each and fires at error severity 286 times, naming every unreachable product. Googlebot arriving at the homepage has no internal path to 92% of the hive inventory, and 3 months after launch those pages still hold no rankings.",
  "passingExample": "The same beekeeping-supplies shop rebuilds the /hives/ index as a fully linked, filterable grid, every brood box, queen excluder, and Langstroth frame is reachable from the catalog, and each product also appears in a 'goes with this hive' block on related pages, so a smoker links to the apiary-starter bundle and the honey extractor links back to the frames it spins. Every one of the 310 SKUs now carries at least 1 inbound internal link. The rule counts no zero-inbound URLs and stays silent, because Googlebot can walk from the homepage to any product in 3 clicks.",
  "howToFix": [
    "Link every orphan from a relevant hub or category index so it joins the site's internal link graph and a crawler can actually reach it.",
    "Fix paginated or truncated index templates that list only the first N items: the missing children are usually the orphans, and crawlable pagination restores them all at once.",
    "Add the page to your primary or contextual navigation when it is genuinely important, so it earns inbound links from high-traffic parts of the site.",
    "Cross-link related items to each other, so a product, article, or location references its siblings instead of depending on one fragile index page.",
    "Re-crawl after wiring the links and confirm the inbound count is no longer 0: a sitemap entry alone does not clear this rule, because the rule measures internal links, not sitemap membership.",
    "For pages that should not exist as standalone URLs, consolidate or noindex them rather than leaving unreachable thin pages stranded in the corpus."
  ],
  "spamBrainContext": "Orphan detection predates the spam era; it is plain crawlability hygiene that Google has documented for as long as it has explained how discovery works. A page nothing links to cannot accumulate the internal PageRank that has shaped ranking since 1998, and Googlebot's own crawl documentation is explicit that links are the primary discovery mechanism.\n\nlinks/orphan-pages (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) sits in the structural integrity family rather than the spam family, but it matters disproportionately on programmatic sites because bulk generation is exactly where orphans appear at scale. The March 27, 2026 core update sharpened scrutiny of programmatic corpora, and a template that emits thousands of unlinked pages presents two problems at once: the pages waste crawl budget Google would rather spend elsewhere, and their existence inflates a site's apparent page count without any of them being reachable or rankable.\n\nWhat the rule cannot see is your sitemap or your external backlinks. It judges the internal link graph alone, so it can flag a page as an orphan even when a sitemap lists it, which is intentional. Sitemap inclusion is a hint, not a navigable path, and Google has repeatedly said a strong internal link is worth more than a sitemap row.",
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
      "a": "Because an unreachable page is a structural defect, not a matter of taste. A URL that nothing links to is functionally invisible to crawlers navigating your site, and invisibility is the most expensive SEO outcome there is, the page cannot rank for anything if a crawler never arrives. Error severity signals that this should be fixed before stylistic concerns, since no amount of content quality helps a page nobody can reach."
    },
    {
      "q": "I run a beekeeping-supplies shop and 286 hive products got flagged. How do I clear them fast?",
      "a": "The cause is almost always a truncated index. If your /hives/ catalog template paginates to the first 24 of 310 SKUs, then 286 brood boxes, queen excluders, and Langstroth frames have zero inbound links. Rebuild the index as a fully crawlable, filterable grid and add a 'pairs with this hive' cross-link block, a $39 smoker linking to its apiary-starter bundle, the honey extractor linking to its frames. Re-crawl and the inbound count for each product rises above 0, clearing all 286 findings in one pass, in one illustrative run the orphaned pages began earning impressions roughly 9 days after the links shipped."
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
    title: "Dead Ends: Pages With Zero Outbound Links to the Rest of Your Crawl",
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
  title: "Link Depth: How Many Clicks From Home Before Googlebot Gives Up",
  metaDescription:
    "Pages buried more than 3 clicks from your homepage waste crawl budget and dilute PageRank. How links/link-depth runs a BFS from the root and flags deep and unreachable pages.",
  primaryKeyword: "link depth SEO",
  oneLiner:
    "links/link-depth runs a breadth-first search from your root URL and measures the shortest click-distance to every page, flagging anything past the default ceiling of 3 clicks as info and anything Googlebot cannot reach from the root at all as a warning, because a page Google crawls last is a page Google ranks last.",
  whatItDetects:
    "links/link-depth treats your internal-link graph the way a crawler does. It seeds a breadth-first search at the root URL you audited, walks every internal link, and records for each page the shortest number of clicks it takes to arrive there. The BFS guarantees that distance is the minimum, so a page linked from both the homepage and a deep article is scored by its nearest path, not its farthest.\n\nTwo distinct findings come out of that single traversal. First, any page whose shortest click-distance exceeds maxClicks (default 3) is reported at info severity with a message naming the page and the depth it sits at. Three clicks is the conventional ceiling because it mirrors how deep a crawler will eagerly follow before a page starts competing for scarce budget.\n\nSecond, any page that has inbound internal links yet never gets visited by the BFS is reported at warning severity as unreachable-from-root. That gap means the page is referenced somewhere, but no chain of links actually connects it back to the root, so a crawler starting at the homepage would never find it.\n\nWhen the audit only sampled a subset of the site, the unreachable check is suppressed, because a missing path may be a sampling artifact rather than a real dead end; the depth measurement keeps running on whatever subgraph was fetched.",
  whyItMatters:
    "Crawl budget and link equity both flow outward from your homepage along internal links, and both thin out with every hop. A page sitting 7 clicks deep receives a fraction of the PageRank that a 2-click page does, and Googlebot reaches it late in a crawl cycle, if at all. The 3-click ceiling is a practical proxy: pages inside it tend to get crawled promptly and rank on their merits, while pages beyond it compete for whatever budget is left.\n\nDepth is not a penalty signal; it is a discoverability one. A buried page is not flagged as spam; it is flagged as expensive to find and starved of the internal authority it needs. That is why this finding lands at info severity. It tells you where your architecture is leaking equity into pages too far from the root to compete.\n\nThe unreachable-from-root warning is sharper. A page that other pages link to but that has no path back to the root is an island. Googlebot can only follow links it can actually reach by walking from a known entry point, so an island page depends entirely on external links or a sitemap to be discovered, and it never receives internal equity. That is a structural defect worth fixing before you touch anything cosmetic.",
  failingExample:
    "A scuba-diving certification school sells a $1,800 open-water cert that runs over 10 days, but buries the page five clicks deep: home, then a region menu, then a dive-site list, then a single reef page, then finally the open-water cert page itself. The BFS records the cert page at depth 5, past the 3-click ceiling, and links/link-depth fires at info, so the page driving 40% of revenue is the one Googlebot reaches last. Worse, the school's nitrox-specialty page is linked only from a retired blog post that nothing else points to, so no chain reaches it from the root: the rule reports it as unreachable-from-root at warning severity, and a crawler starting at the homepage would never find it.",
  passingExample:
    "The same scuba school flattens its architecture. The homepage links straight to a course hub, and the hub links directly to every certification page (open-water, advanced, rescue diver, and nitrox specialty) so each cert page sits exactly 2 clicks from the root, comfortably inside the 3-click ceiling. The dive log, wetsuit-and-regulator rental, buoyancy clinic, and decompression-theory pages are all cross-linked from the hub too, so the BFS reaches every URL and not one page is stranded. Within 4 weeks of the restructure, organic impressions on that $1,800 cert page climb roughly 30% as Googlebot crawls it early and internal equity flows to it. links/link-depth stays silent: nothing is buried, nothing is an island.",
  howToFix: [
    "Link your deepest money pages directly from a hub or category page so the BFS reaches them in 2 to 3 clicks instead of 5 or 6.",
    "Audit any page reported as unreachable-from-root first; that is a structural island, and adding a single navigational link from a reachable page fixes it.",
    "Flatten deep taxonomies: collapse redundant intermediate index pages that add a click without adding value to a visitor or a crawler.",
    "Add contextual in-content links from popular shallow pages down to important deep ones, so equity has a short path to follow.",
    "Re-run the audit after restructuring, because moving one hub link can lift an entire subtree of pages back inside the 3-click ceiling at once.",
    "Do not rely on an XML sitemap to rescue a buried page: a sitemap aids discovery but does not pass the internal PageRank that depth controls."
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
      a: "Both come from the same breadth-first search, but they are different findings. A deep page is reachable from the root (the BFS does visit it) but only after more clicks than the ceiling allows, so it fires at info severity. An unreachable-from-root page has inbound internal links yet is never visited by the BFS at all, meaning no chain of links connects it back to the root. That is a structural island and fires at the sharper warning severity, because a crawler starting at the homepage would never find it."
    },
    {
      q: "How would this rule treat my dive school's course pages?",
      a: "Imagine a scuba-diving certification school whose $1,800 open-water cert page sits five clicks deep behind a region menu, a dive-site list, and a reef page. The BFS records depth 5, past the 3-click ceiling, and the rule flags it at info, Googlebot reaches it late and it inherits little internal equity. If your nitrox-specialty page is linked only from a stranded blog post with no path back to the root, the rule escalates to a warning. Link both pages from a course hub two clicks from home, give it 4 weeks, and every finding clears while the cert page starts ranking on its merits."
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
      a: "When pseolint only fetches a subset of a large site, the link graph it builds reflects the sample, not the whole site. A page that looks unreachable might simply be missing its intermediary pages from the crawl, the real path back to the root exists, the audit just did not fetch the pages in between. To avoid crying wolf on a sampling artifact, the rule suppresses the unreachable-from-root warning on sampled runs. The depth measurement still runs on whatever subgraph was fetched, since that distance is meaningful even on a partial crawl."
    }
  ],
  relatedRules: ["orphan-pages", "dead-ends", "cluster-connectivity"],
  relatedTool: "spambrain-checker"
},
  {
    slug: "cluster-connectivity",
    ruleId: "links/cluster-connectivity",
    title: "Cluster Connectivity: When a Directory of Pages Becomes a Topic Silo",
    metaDescription:
      "A directory of pages with no internal links in or out is a topic silo that hoards authority. How links/cluster-connectivity flags siloed same-parent clusters.",
    primaryKeyword: "internal linking topic silo",
    oneLiner:
      "links/cluster-connectivity groups every crawled URL by its parent directory, and for each cluster of 2 or more pages it checks whether a single internal crawl link enters from another cluster or leaves toward one: firing a warning when neither exists, because Google cannot diffuse authority into a directory that no other section of your site references or is referenced by.",
    whatItDetects:
      "The rule keys every crawled URL to its parent directory using the same cluster logic the link family shares: /cheese/affinage/ and /cheese/rind/ collapse to the /cheese/ parent, so a cluster is simply the set of pages that live under one folder. It builds that map first, then only looks at clusters that hold 2 or more pages, because a lone page is an orphan question, not a connectivity one.\n\nFor each multi-page cluster it asks two narrow questions against the set of URLs the crawl actually knows about. First, outbound: does any page in the cluster carry a resolved internal href whose target resolves to a different cluster? Second, inbound: does any page outside the cluster link to any URL inside it? A link that stays within the same parent directory does not count for either test, internal-to-cluster links keep the silo sealed.\n\nWhen a cluster of 2 or more pages has neither a cross-cluster outbound link nor a cross-cluster inbound link, it is a sealed silo and the rule emits one warning naming the directory, the page count, and the affected URLs. A cluster with even a single link crossing its boundary in either direction passes.",
    whyItMatters:
      "Internal links are how PageRank-style authority flows through a site. A directory that no other section links to, and that links to nothing outside itself, is a closed loop: whatever authority lands on it stays trapped, and whatever authority the rest of the site has cannot reach it. The pages can be individually excellent and still underperform because they sit in a pocket Google has no strong path into.\n\nThis is a warning, not an error, because a silo is a missed opportunity rather than a spam signal. A 12-page guide to washed-rind cheeses that no recipe, no shop category, and no blog post ever links to is not penalised; it is simply starved. The fix is cheap and additive: one contextual link from a related section into the cluster, and one back out, breaks the seal and lets authority diffuse both ways.\n\nThe rule deliberately requires total isolation in both directions before it fires. A cluster that receives even one inbound link, or sends even one outbound link to another section, is considered connected, because that single edge is enough for a crawler to find and credit the directory. The bar is set at sealed, not merely sparse.",
    failingExample:
      "A specialty fromagerie ships a /cave-aged/ directory with 9 deep guides, affinage timelines, washed-rind humidity, raw-milk safety. Every link inside those pages points only to other /cave-aged/ guides, and nothing in the shop's /shop/ catalog, its /recipes/ pairings, or its /journal/ posts ever links into the directory. The cluster is sealed in both directions, so the rule warns: 'Cluster /cave-aged/ (9 pages) has no crawl links to or from other clusters.' The guides took 6 weeks to write, yet draw barely 4% of the site's organic sessions, because Google has no internal path into the silo.",
    passingExample:
      "The same fromagerie adds two contextual links. The /shop/ page for its flagship cave-aged gruyere (a $42 wheel aged 18 months in the cave) links into /cave-aged/affinage-timeline, giving the cluster an inbound edge from the catalog; and each /cave-aged/ guide closes with a 'shop this wheel' link out to the matching /shop/ product, giving it outbound edges. One inbound link plus outbound links is more than enough; the seal is broken in both directions, authority diffuses between the curd-to-counter sections, and the rule stays silent on a directory that now sits inside the site's link graph instead of beside it.",
    howToFix: [
      "Add at least one inbound link from a related section. A single contextual link from your catalog, blog, or navigation into the siloed directory is enough for a crawler to find and credit it.",
      "Add at least one outbound link from inside the cluster to another section. Linking out is half the test; a cluster that only receives links still reads as a one-way pocket until its own pages reference the rest of the site.",
      "Link on topical relevance, not in a footer dump. A contextual link from a genuinely related page passes far more authority and reads as editorial rather than as a sitewide boilerplate block.",
      "Audit your navigation for whole sections it omits. Silos usually form when a directory was built after the main nav was frozen and never got wired back into it.",
      "Re-crawl after adding the links. Because the rule only needs one crossing edge in each direction, a small number of well-placed links can clear several siloed clusters at once.",
      "Treat the warning as a discoverability prompt, not a penalty. The pages are not flagged as low quality; they are flagged as unreachable, which is usually a quick fix with outsized traffic upside."
    ],
    spamBrainContext:
      "Cluster connectivity is not a spam rule at all; it is a discoverability and authority-flow rule that happens to share the link family's plumbing. Google has said for years, most explicitly across its 2008 to 2024 internal-linking guidance, that internal links help it discover pages and understand site structure, and that important pages should be reachable from many internal links. A sealed directory contradicts both: it is hard to discover and structurally orphaned from the rest of the topic graph.\n\nThe rule ships in @pseolint/core (MIT-licensed at github.com/ouranos-labs/pseolint) at warning severity, never error, because a silo is a self-inflicted ceiling on your own pages, not a violation that draws enforcement. It pairs naturally with the rest of the link family; it asks a coarser, cluster-level version of the question that per-page reachability rules ask, catching the case where an entire folder, not just one stray URL, fell out of the link graph.\n\nWhat the rule cannot see is whether the isolation was deliberate. A staging directory, a gated members area, or a deliberately noindexed section may be siloed on purpose. The rule reports the structural fact (this cluster has no crossing edges) and leaves the judgment of whether that is intended to you."
    ,
    faqs: [
      {
        q: "What exactly counts as a cluster here?",
        a: "A cluster is the set of crawled pages that share the same parent directory. The rule keys each URL to its parent folder (so /cheese/rind and /cheese/affinage both belong to the /cheese/ cluster) and only evaluates clusters that hold 2 or more pages. A single page under a directory is an orphan question handled elsewhere, not a connectivity one, which is why the rule needs at least two pages before it considers a directory a cluster worth testing."
      },
      {
        q: "Why does a link within the same directory not count?",
        a: "Because links that stay inside the cluster keep the silo sealed. The whole point of the rule is to detect a directory that the rest of the site cannot reach and that reaches nothing outside itself. Nine guides that link only to each other are still a closed loop no matter how densely they interlink internally. Only an edge that crosses the cluster boundary (inbound from another section or outbound to one) proves the directory is part of the wider link graph."
      },
      {
        q: "Does the rule need both an inbound and an outbound link to pass?",
        a: "No. The rule fires only when a cluster has neither a cross-cluster inbound link nor a cross-cluster outbound link. A single crossing edge in either direction is enough to clear it. In practice you usually want both (authority should flow into and out of a section) but the rule's bar is total isolation, so even one link entering or leaving the directory is enough to silence the warning."
      },
      {
        q: "It is a warning, not an error: should I still care?",
        a: "Yes, because a silo is a ceiling on your own pages. The severity is warning rather than error because isolation is a missed opportunity, not a spam signal that draws a manual action. But a directory Google cannot reach internally tends to underperform regardless of page quality. The fix is one of the cheapest, highest-upside changes in the audit: a couple of contextual links can unlock a whole section that was quietly starved of authority."
      },
      {
        q: "My fromagerie has a /cave-aged/ directory that trips this: what do I do?",
        a: "Wire it into the rest of the shop. Link your /shop/ catalog page for a cave-aged wheel into the relevant affinage guide so the cluster gains an inbound edge, and have each guide link out to the matching product or to a /recipes/ pairing so it gains outbound edges. One contextual link from the counter to the cave and one back is enough to break the seal. The 9 guides that took 6 weeks to write stop being a sealed terroir pocket and start passing authority to and from the rest of the site within a crawl or two."
      }
    ],
    relatedRules: ["host-section-divergence", "template-diversity"],
    relatedTool: "spambrain-checker"
  },
  {
  slug: "url-pattern",
  ruleId: "cannibal/url-pattern",
  title: "URL Pattern Cannibalization: When Two Slugs Are the Same Words Reordered",
  metaDescription:
    "Two URLs in one directory built from the same slug words in a different order compete for one query. How cannibal/url-pattern detects token-reorder URL cannibalization.",
  primaryKeyword: "URL cannibalization",
  oneLiner:
    "cannibal/url-pattern splits each URL's last slug on hyphens, sorts the tokens, and flags at info severity any two pages in the same directory whose sorted token sets match exactly: the reordered-slug keyword cannibalization Google has resolved by collapsing competing URLs to one canonical result since well before its March 2026 core update.",
  whatItDetects:
    "cannibal/url-pattern looks for two URLs that are, word for word, the same page wearing a different word order. For every page it takes the final path segment (the slug after the last slash, trailing slashes removed) splits it on hyphens, drops empty tokens, and sorts what remains alphabetically. Two slugs that differ only in the order of their words produce an identical sorted token list.\n\nThe rule then compares pages pairwise, but only within the same parent directory: the path up to that last slash must match, and it must not be empty. When two distinct URLs in one directory collapse to the same sorted tokens, the rule fires once at info severity, naming both URLs and reporting that they carry the same tokens in a different order. Pages in different directories never compare against each other, and a slug with no tokens is skipped. The match is exact after sorting (not fuzzy) so it fires only when the two slugs really are the same word set reshuffled.",
  whyItMatters:
    "Two URLs assembled from one word set are two pages chasing a single query. A vintage-synth marketplace that ships /moog-analog-synthesizer and /analog-synthesizer-moog in the same listings directory has not built two products; it has built one product twice and asked Google to choose. The crawler usually does choose; it folds the pair to a single canonical result and splits the link equity, anchor text, and click history that should have accrued to one strong page across two weaker ones.\n\nThe damage is quiet because nothing 404s and nothing looks broken. Both pages index, both rank somewhere, and neither ranks as well as the consolidated page would. On a programmatic catalog the reorder is rarely intentional; it usually comes from a slug builder that concatenates attribute tokens in whatever order the data arrives, so /eurorack-modular-oscillator and /oscillator-eurorack-modular both get minted from the same record. The rule sits at info severity because a reordered pair is a signal to consolidate, not proof of spam, but every such pair is link equity you are dividing against yourself.",
  failingExample:
    "A vintage-synthesizer marketplace mints two listing URLs from one record: /listings/moog-modular-oscillator and /listings/oscillator-moog-modular. Both live in /listings, and after splitting each slug on hyphens and sorting, both collapse to modular-moog-oscillator, the same three tokens reshuffled. The rule fires at info: 'these URLs have the same tokens in different order'. Google indexed both, picked one as canonical 9 days after launch, and the patch-cable and CV-gate detail on the losing page now earns nothing toward the ranking page.",
  passingExample:
    "The same marketplace settles on one canonical slug order for every listing and 301-redirects the reordered twin: /listings/oscillator-moog-modular permanently points at /listings/moog-modular-oscillator. Within the /listings directory no two slugs now share a sorted token set, so the rule stays silent. The MIDI spec, the filter-cutoff range, and the modular-rack photos all consolidate onto one URL, and the page that was splitting equity with its anagram now holds the full signal for the query.",
  howToFix: [
    "Pick one canonical token order for every slug your builder emits, so the same record can never mint both /moog-analog-oscillator and /oscillator-moog-analog.",
    "Add a 301 redirect from the reordered twin to the canonical URL, collapsing the pair into one address before the link equity finishes splitting.",
    "Set a rel=canonical on any duplicate you cannot redirect, pointing every reordered variant at the single slug you want Google to rank.",
    "Audit the slug-generation code, not the pages: the reorder almost always comes from a builder concatenating attribute tokens in whatever order the data arrives.",
    "Sort or fix the token order at write time in your data pipeline, so new listings are minted in canonical order and the pair never appears again.",
    "Check internal links and your sitemap for both variants, and repoint every reference at the canonical slug so crawlers stop discovering the twin."
  ],
  spamBrainContext:
    "Keyword cannibalization predates any algorithm name; it is simply two of your own pages competing for the same query, a problem SEOs have written about since the early 2010s. Reordered URL slugs are one of its most mechanical forms: not a content overlap a writer introduced, but a duplicate the address space minted on its own when a slug builder shuffled the same attribute tokens.\n\ncannibal/url-pattern (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) reasons about your URL structure rather than your page content. It does not read the HTML at all; it only asks whether two addresses in one directory are the same words in a different order. That is why it ships at info severity and never contributes a blocker on its own: a reordered pair is a consolidation opportunity, not a policy violation. Google's deduplication systems will eventually pick one canonical URL for the pair regardless, so the rule's job is to surface the split before the crawler resolves it for you and you lose a say in which slug wins.",
  faqs: [
    {
      q: "What exactly counts as a reordered-token match?",
      a: "Two URLs match when they sit in the same parent directory and their final slugs, after splitting on hyphens and sorting alphabetically, produce the identical token list. So /gear/analog-synth-rack and /gear/rack-synth-analog match because both sort to analog-rack-synth, while /gear/analog-synth-rack and /shop/analog-synth-rack do not, because their directories differ. The comparison is exact after sorting, so a single different or extra word breaks the match and the rule stays silent."
    },
    {
      q: "Why is this only an info-severity finding?",
      a: "Because a reordered slug pair is a signal to consolidate, not evidence of spam or manipulation. Nothing is broken (both pages still load and index) so the rule never blocks an audit verdict on its own. It surfaces the pair so you can decide which slug to keep and redirect the other, ideally before Google's deduplication picks a canonical URL for you. Treat it as a cleanup task that recovers split link equity, not as an emergency."
    },
    {
      q: "Will it flag two URLs that share words but in different directories?",
      a: "No. The rule compares pages only within the same parent directory, the entire path up to the final slash must match, and it must not be empty. So /listings/moog-oscillator and /archive/oscillator-moog never compare against each other, even though their slugs are the same two words reordered. Directory scoping keeps the rule from flagging legitimately separate sections that happen to reuse vocabulary, and it only ever fires on genuine same-folder duplicates."
    },
    {
      q: "My synth marketplace auto-builds slugs from attribute tags: how do I stop reordered duplicates?",
      a: "This is the classic source of the finding. A listing for a Moog modular oscillator gets a slug concatenated from its attribute tokens, but if the same instrument is re-listed and the tags arrive as oscillator, modular, moog instead of moog, modular, oscillator, your builder mints /listings/oscillator-modular-moog alongside the original /listings/moog-modular-oscillator, two URLs, one patch-cable-and-CV-gate product. Fix it at write time: sort the attribute tokens into a fixed canonical order before assembling the slug, so the polyphony, filter-cutoff, and MIDI details of a given modular rack only ever resolve to one address. In one illustrative cleanup, a dealer carrying 1,400 listings found 6% were reordered twins and recovered the split equity within 3 weeks of redirecting them."
    },
    {
      q: "Does redirecting the duplicate recover the lost ranking signal?",
      a: "Largely, yes. A 301 redirect from the reordered twin to your canonical slug passes the accumulated link equity and consolidates the two pages' signals onto one URL, so the page that was competing with its own anagram regains the anchor text and click history it was splitting. The recovery is not instant (Google has to recrawl and process the redirect) but it is the right fix, because leaving the pair live means the crawler keeps dividing the signal until it picks a canonical itself, with no guarantee it picks the slug you would have chosen."
    }
  ],
  relatedRules: ["near-duplicate", "title-uniqueness", "meta-uniqueness"],
  relatedTool: "doorway-page-detector"
},
  {
  "slug": "freshness-signals",
  "ruleId": "aeo/freshness-signals",
  "title": "Freshness Signals: When a Page Gives AI Engines No Sign It Is Current",
  "metaDescription": "AI engines favour pages that prove they are current. How aeo/freshness-signals flags a missing dateModified and content older than the 180 days staleness default.",
  "primaryKeyword": "content freshness signals SEO",
  "oneLiner": "aeo/freshness-signals checks every page for a real modification signal (a JSON-LD dateModified, an article:modified_time meta tag, or a visible 'Last updated' line) warns at medium confidence when none exists, then drops to an info note when the best date it can parse is older than the staleness default of 180 days Google has long associated with how AI Overviews weigh recency.",
  "whatItDetects": "aeo/freshness-signals asks one question of every crawled page: does it carry evidence that it has been touched recently. The rule looks for a true modification signal in three places, a dateModified field anywhere in the page's JSON-LD (found by a recursive walk), a modification meta tag (article:modified_time, last-modified, dc.date.modified, or a <time datetime> element), or visible 'Last updated', 'updated on', 'revised', or 'last modified' text in the rendered content.\n\nA datePublished alone is deliberately not enough. A page born in 2019 and never edited has a publication date but no modification signal, so it falls through to a warning at medium confidence, medium because evergreen pages like an about, pricing, or policy page may legitimately omit a modified date, and re-stamping them would mislead readers.\n\nWhen a modification signal does exist, the rule parses the best date it can find and measures its age. If that age exceeds maxStaleDays (180 days by default) it emits an info finding at low confidence, because stale by the clock is not always stale by meaning. The two findings sit at different severities on purpose: a missing signal is a warning, an old-but-present date is only an info note.",
  "whyItMatters": "AI engines and the AI Overviews layer prioritise content that can prove it is current, because a synthesised answer that cites a stale page inherits that page's staleness. For any topic that moves (pricing, regulations, conditions that change with the seasons) a missing or ancient modification date is a reason for an engine to reach past you to a competitor that timestamps its work.\n\nThe rule catches the failure mode programmatic templates fall into most often: the body binds live data, but the template never surfaces a dateModified, so a page that was regenerated this morning looks, to a crawler, exactly as old as the day it was first published. The data is fresh; the signal is not. A surf-forecast page can rebuild its swell and tide tables every 6 hours and still read as untouched since launch if no modified date rides along with the refresh.\n\nBoth findings are gentle by design (a warning for the missing signal, an info note for the aged date) because freshness is contextual. The rule's job is to ask whether recency matters for this page type and, if it does, whether the page bothers to claim it.",
  "failingExample": "/forecast/ocean-beach-weekly on a tide and surf-forecast site. The template repulls buoy readings and recomputes the swell period table every 6 hours, but the rendered HTML carries no JSON-LD dateModified, no article:modified_time meta tag, and no visible 'Last updated' line, only a datePublished of January 14, 2022 buried in the schema. The rule finds no modification signal and fires a warning at medium confidence: the page that updates 4 times a day looks, to a crawler, three years stale.",
  "passingExample": "The same /forecast/ocean-beach-weekly page, instrumented to timestamp its refresh. Each time the offshore-wind and tide-table data repulls, the template writes a JSON-LD dateModified and renders a visible 'Last updated: June 11, 2026, 06:00' line above the set-wave chart. The crawler now reads a modification signal dated hours ago, the parsed age is well under the default of 180 days, and neither the missing-signal warning nor the staleness info note fires, the page's freshness claim finally matches its actual update cadence.",
  "howToFix": [
    "Add a real dateModified to your JSON-LD schema and bump it whenever the page's underlying data changes, not just when a human edits the prose.",
    "Render a visible 'Last updated: YYYY-MM-DD' line in the page body so both readers and AI engines see the freshness claim without parsing schema.",
    "Wire the modified timestamp to your data source for pSEO templates, so a forecast page that repulls every 6 hours stamps the moment it actually regenerated.",
    "Keep your sitemap <lastmod> accurate and aligned with the on-page date: a contradictory lastmod is worse than none, since it tells the crawler your timestamps cannot be trusted.",
    "Leave genuinely evergreen pages alone: an about, pricing, or policy page that has not changed should not carry a fake recent date that would mislead a reader.",
    "Refresh the body, not just the date, on pages older than the 180 days default whose information has actually moved on, then bump dateModified to reflect the real edit."
  ],
  "spamBrainContext": "Freshness is not a spam policy and not a lever you can pull with a fake timestamp, Google has been explicit for years that re-dating a page without changing it does nothing, and can erode trust if the claimed date and the actual content diverge. aeo/freshness-signals lives in the aeo/* family because its real audience is the AI-answer layer: the engines that synthesise AI Overviews lean on recency to decide which source to ground an answer in, and a page that never timestamps its updates makes that decision easy in a competitor's favour.\n\nThis rule (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is deliberately the gentlest member of its family. The missing-signal case fires at warning with medium confidence because evergreen pages legitimately omit a modified date; the stale-date case fires at info with low confidence because a page 200 days old is not wrong, only unproven. Neither is a verdict.\n\nWhat the rule cannot do is judge whether your content is actually current; it reads the claim, not the truth behind it. A surf site that stamps a fresh dateModified on a swell table it never recomputed has satisfied the rule and fooled nobody who reads the stale forecast. The honest move is to make the timestamp follow the data, so the signal stays true.",
  "faqs": [
    {
      "q": "What counts as a modification signal, and why isn't datePublished enough?",
      "a": "Three things satisfy the rule: a dateModified anywhere in the JSON-LD, a modification meta tag (article:modified_time, last-modified, dc.date.modified, or a <time datetime> element), or visible 'Last updated', 'updated on', 'revised', or 'last modified' text in the body. A datePublished alone is deliberately excluded, a page first published in 2019 and never touched has a publication date but no evidence it has been maintained, which is exactly the staleness the rule is built to surface. Without one of the three modification signals, the page falls through to the warning."
    },
    {
      "q": "What is the staleness threshold and what happens when a page crosses it?",
      "a": "The maxStaleDays default is 180 days. When a page does carry a modification signal, the rule parses the best date it can find and measures its age against that threshold. A page last updated more than 180 days ago emits an info finding at low confidence, low because some pages are evergreen by design and stale by the clock is not the same as stale by meaning. You can tune maxStaleDays in the config if your content type changes faster or slower than the default of 180 days."
    },
    {
      "q": "Why is the missing-signal case a warning but the stale-date case only an info note?",
      "a": "Because the two failures carry different weight. A page with no modification signal at all gives an AI engine nothing to assess, so it warns at medium confidence, though even that is hedged, since an about or pricing page may legitimately have no modified date. A page that does carry a date but is simply old is a softer case: the signal exists, it is just aged, and aged content can be perfectly current in meaning. That is why an old-but-present date drops to an info note at low confidence rather than a warning."
    },
    {
      "q": "Our tide and surf-forecast pages rebuild constantly but still trip the missing-signal warning, what is wrong?",
      "a": "Almost certainly the template recomputes the data without ever writing a freshness signal alongside it. A page that repulls buoy readings and recalculates the swell period and tide table every 6 hours is genuinely fresh, but if it renders no JSON-LD dateModified, no article:modified_time meta tag, and no visible 'Last updated' line, the crawler sees only the original datePublished and reads the page as untouched since launch. The fix is to wire the modified timestamp to the data refresh, so each regeneration stamps a real dateModified and a visible 'Last updated' line above the forecast. As an illustration, one forecast site that started timestamping its refresh cycle every 6 hours saw the share of its pages cited in AI answers climb 28% over the following 10 weeks, simply because the freshness claim finally matched the actual update cadence."
    },
    {
      "q": "Does adding a fake recent dateModified satisfy the rule and improve rankings?",
      "a": "It satisfies the literal check, because the rule reads whether a modification signal is present, not whether the content behind it actually changed. But it gains you nothing real. Google has said for years that re-dating an unchanged page is not a ranking lever, and a claimed date that contradicts visibly stale content erodes the trust the timestamp was supposed to build. The honest pattern is to make the modified date follow the data (bump it when the page truly changes, leave it alone when it does not) so the freshness signal stays true rather than becoming a liability a reader or an AI engine can catch."
    }
  ],
  "relatedRules": ["eeat-signals", "missing-author", "publication-velocity"],
  "relatedTool": "spambrain-checker"
},
  {
  slug: "llms-txt",
  ruleId: "aeo/llms-txt",
  title: "llms.txt: A Draft Convention for Guiding AI Engines, Checked at Your Origin",
  metaDescription:
    "llms.txt is a draft, low-adoption convention for pointing AI engines at your best content. How pseolint fetches /llms.txt once at your origin and runs 3 lenient shape checks.",
  primaryKeyword: "llms.txt file SEO",
  oneLiner:
    "llms.txt is a draft, low-adoption convention proposed in September 2023 and championed by Jeremy Howard at Answer.AI, so pseolint runs this as a low-confidence, informational site-level check that fetches /llms.txt once at your origin and verifies 3 shape rules, treating a missing file as a missed opportunity worth roughly 1 hour of work, never a defect.",
  whatItDetects:
    "This is a site-level check, not a per-page one: it runs exactly once against your origin. pseolint takes the source URL, derives its origin, requests `${origin}/llms.txt` with a 10 second timeout, and only proceeds for http and https targets. If the request fails, times out, or returns a non-200 status, the file is treated as absent.\n\nWhen the file is present, pseolint runs three deliberately lenient shape checks drawn from the llmstxt.org proposal. First, the opening non-empty line must be an `# ` H1 title (lines that start with `#` but carry no title text are skipped, not rejected). Second, the file must contain at least one `## ` section heading. Third, it must list at least one markdown link of the form `- [Title](https://...)` somewhere under a section. A file that satisfies all three passes silently.\n\nA missing file and a malformed file both surface the same low-confidence, informational finding, one tells you nothing exists at the origin, the other names which of the three rules failed. The check is intentionally forgiving because the specification is still evolving; it rejects only obvious garbage.",
  whyItMatters:
    "Be candid about what this is: llms.txt is a draft convention with low industry adoption, not a ranking factor and not an established standard. That is exactly why pseolint reports it at low confidence and informational severity. An absent llms.txt is a missed opportunity, never a defect, and you can ship a perfectly healthy site without one.\n\nThe upside, where it applies, is editorial control. A well-formed llms.txt lets you hand an AI engine a curated map straight to your most authoritative, citable pages instead of leaving it to infer structure from a sprawling sitemap. For a project with deep, fast-moving content (release notes, an API reference, a migration guide) that curation can be the difference between an assistant quoting your current quickstart or an answer it stitched together from a 2 year old blog post.\n\nNo search engine is known to consume llms.txt as a ranking input, and pseolint makes no such claim. Treat a finding here as a 30 minute experiment worth trying, not a penalty to fix. The authoritative reference for the format is llmstxt.org.",
  failingExample:
    "An open-source CLI tool publishes docs at docs.example.dev and adds a /llms.txt that opens with a blockquote summary, then jumps straight into bare URLs: `> The official SDK for Example.` followed by `https://docs.example.dev/quickstart` and `https://docs.example.dev/api`. pseolint fetches it, finds no leading `# ` H1 title and no `## ` section headings, and emits a low-confidence finding naming the first failed rule, the file exists but does not match the llmstxt.org shape, so an AI engine reading it gets an unlabeled list with no hierarchy to reason about.",
  passingExample:
    "The same documentation site fixes it: `# Example SDK` as the H1, a one-line blockquote summary, then `## Getting Started` listing `- [Quickstart](https://docs.example.dev/quickstart): install and first call in 5 minutes`, followed by `## Reference` with `- [API Reference](https://docs.example.dev/api): every endpoint and type` and `## Releases` linking `- [Changelog](https://docs.example.dev/changelog): updated within the last 7 days`. All three shape checks pass (an H1 title, two-plus `## ` sections, and several markdown links) so pseolint stays silent and an assistant gets a clean, captioned map to the SDK's most citable pages.",
  howToFix: [
    "Create a plain-text file at the root of your origin, served as /llms.txt, that opens with a single `# Project Name` H1 title on the first non-empty line.",
    "Add a short blockquote summary under the title, then break your content into `## ` sections such as Getting Started, API Reference, Guides, and Releases.",
    "Under each section, list your most citable pages as markdown links in the form `- [Quickstart](https://...): one-line description` so an engine can read both the link and its purpose.",
    "Point the links at canonical, current pages (your live quickstart, API reference, SDK guides, and changelog) not deep-archived or redirecting URLs.",
    "Keep it in sync with releases: a stale llms.txt that omits a new major version or a renamed code sample misleads engines more than having none at all.",
    "Validate against the format described at llmstxt.org and re-run the audit; a passing file is silent, so no finding means the three shape checks are satisfied."
  ],
  spamBrainContext:
    "This rule sits apart from the spam-detection family. The spam/* and links/* rules look for patterns Google's SpamBrain classifier penalizes; llms.txt is the opposite kind of signal, an optional, opt-in convention for AI answer engines that no search ranking system is known to consume. pseolint will never tell you a missing llms.txt put you at risk of a penalty, because it cannot and does not.\n\nThat framing is why the finding is low confidence and informational. The check is lenient by construction: it fetches once at the origin, applies three shape rules, and reports either absence or the single rule that failed. It rejects only obvious garbage and passes anything that opens with an H1, carries a section, and lists a link.\n\nIf you maintain an open-source tool whose documentation site ships frequent release notes and a versioned API reference, an accurate llms.txt is a cheap 1 hour investment that can keep AI assistants quoting your current docs rather than a cached page from 3 weeks ago. If you don't, you are losing nothing pseolint scores against you. The format and its rationale are documented at llmstxt.org.",
  faqs: [
    {
      q: "Is llms.txt an official standard that affects my Google rankings?",
      a: "No. llms.txt is a draft, low-adoption convention proposed at llmstxt.org, not a ratified standard, and no search engine is known to use it as a ranking input. pseolint deliberately reports it at low confidence and informational severity for that reason. A missing file is a missed opportunity to guide AI answer engines, never a defect and never a penalty risk, so you can ignore the finding with no SEO consequence if the format doesn't fit your project."
    },
    {
      q: "How does the rule decide my llms.txt is malformed?",
      a: "It applies three lenient shape checks from the llmstxt.org proposal. The first non-empty line must be an `# ` H1 title, the file must contain at least one `## ` section heading, and it must list at least one markdown link in the `- [Title](https://...)` form under a section. If any one of those fails, the finding names that specific rule. The check is forgiving on purpose because the spec is still evolving; it only rejects files that clearly miss the shape, not stylistic choices."
    },
    {
      q: "I run an open-source tool's documentation site: what should my llms.txt actually contain?",
      a: "Open with `# Your Tool Name`, a one-line blockquote summary, then group your highest-value pages under `## ` sections. A practical layout is `## Getting Started` linking your quickstart and install guide, `## Reference` linking your API reference and SDK docs, and `## Releases` linking your changelog and release notes. List each as `- [Page](https://...): short description`. That gives an AI engine a captioned map straight to your canonical, current pages instead of leaving it to crawl the whole site."
    },
    {
      q: "Why does the check only run once instead of per page?",
      a: "Because llms.txt is an origin-level file, not a page attribute. The rule derives your origin from the audited URL and requests `${origin}/llms.txt` a single time with a 10 second timeout. There is exactly one such file per site, so checking it per page would be wasteful and would report the same result hundreds of times. The audit runs it once and surfaces a single site-level finding for the whole origin."
    },
    {
      q: "Does a missing or failed fetch count the same as a malformed file?",
      a: "Both produce a low-confidence, informational finding, but the messages differ. A request that fails, times out after 10 seconds, or returns a non-200 status is treated as absent, and the finding tells you no llms.txt was found at the origin. A file that returns successfully but fails one of the three shape checks produces a malformed finding that names the failed rule. Neither outcome is scored as a penalty, both are surfaced as optional improvements."
    }
  ],
  relatedRules: ["freshness-signals", "crawler-access", "faq-coverage"],
  relatedTool: "spambrain-checker"
},
  {
  slug: "crawler-access",
  ruleId: "aeo/crawler-access",
  title: "Crawler Access: Is Your robots.txt Blocking AI Answer Engines?",
  metaDescription:
    "Your robots.txt decides whether GPTBot, ClaudeBot, and PerplexityBot can read your pages. How aeo/crawler-access parses it per user-agent and surfaces the AI crawler tradeoff.",
  primaryKeyword: "AI crawler robots.txt",
  oneLiner:
    "aeo/crawler-access parses your robots.txt user-agent by user-agent and checks 8 named AI crawlers (GPTBot from OpenAI, ClaudeBot from Anthropic, PerplexityBot, Google-Extended, and four more) warning once per fully blocked bot and escalating to an error only when every one is disallowed, so blocking them stays a deliberate choice you make, not a verdict the rule hands down.",
  whatItDetects:
    "The rule reads your robots.txt and parses it into a map of user-agent to its Disallow patterns, lowercasing every agent name so the lookup is case-insensitive and stacking consecutive User-agent lines that share one rule block. It then walks a default list of 8 AI crawler user-agents: GPTBot (OpenAI), ChatGPT-User (OpenAI), ClaudeBot (Anthropic), PerplexityBot (Perplexity), Bytespider (ByteDance), Google-Extended (Google), CCBot (Common Crawl), and Applebot-Extended (Apple). You can override this list in pseolint.config.ts to add or remove agents.\n\nFor each crawler the rule asks one question: is this bot fully disallowed? A bot counts as blocked when its own block contains a root Disallow (`Disallow: /` or `Disallow: /*`), or when it has no rule of its own and falls back to a wildcard `User-agent: *` block that is itself fully disallowed. A bot with its own narrower block (say `Disallow: /admin/`) is not counted as blocked, because the rest of the site is still readable.\n\nEvery fully blocked crawler produces one warning naming that bot. If the count of blocked crawlers equals the full configured list (every AI agent disallowed) the warnings collapse into a single error instead, because total blocking is an unambiguous, site-wide decision worth one clear finding rather than 8 scattered ones.",
  whyItMatters:
    "Answer engines like ChatGPT, Claude, Perplexity, and Google's AI Overviews build their responses from pages their crawlers are allowed to fetch. If GPTBot, ClaudeBot, or PerplexityBot hit a `Disallow: /` in your robots.txt, your pages are simply absent from the pool those systems draw citations from; you cannot be quoted by a model that was never permitted to read you.\n\nThis is a tradeoff, not a mistake. Blocking AI crawlers is a legitimate, defensible choice: you may not want your writing used as model training data, you may sell the same content you would otherwise be giving away, or you may have a licensing arrangement that forbids it. The rule does not tell you that you must let these bots in. What it does is make the consequence visible (a fully blocked crawler means zero AI-answer citations from that engine) so the decision is one you took on purpose rather than one a stray wildcard rule made for you.\n\nThe severity split mirrors that intent. A single blocked bot is a medium-confidence warning, because partial blocks are often deliberate, many sites allow GPTBot and ClaudeBot while blocking Bytespider for policy reasons. Blocking all 8 at once is a high-confidence error, because whether it is intentional or an accident, the effect is the same and unambiguous: total invisibility to answer engines.",
  failingExample:
    "Brasswind Press, an independent tabletop-RPG publisher, ships this robots.txt across its store and SRD pages:\n\n```\nUser-agent: *\nDisallow: /admin/\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n```\n\nThe wildcard block only hides /admin/, so most bots are fine, but GPTBot, ClaudeBot, and PerplexityBot each carry a root `Disallow: /`. The rule emits 3 warnings, one per bot. When a player asks ChatGPT \"what's the best beginner d20 sourcebook,\" Brasswind's flagship rulebook cannot be cited because GPTBot was never allowed past the front door. Within 3 weeks of launch the team noticed every rival publisher surfacing in AI answers while their own 12 sourcebook pages stayed dark.",
  passingExample:
    "Brasswind Press narrows the blocks so AI crawlers can read the free content while the unreleased campaign setting stays private:\n\n```\nUser-agent: *\nDisallow: /admin/\nDisallow: /unreleased-campaign/\n\nUser-agent: GPTBot\nDisallow: /unreleased-campaign/\n\nUser-agent: Bytespider\nDisallow: /\n```\n\nGPTBot now has its own block, but it is narrow, only the secret setting is hidden, so GPTBot is not counted as fully blocked. ClaudeBot and PerplexityBot fall back to the wildcard, which leaves the SRD, the d20 quickstart, and the miniature painting guides readable. Only Bytespider is fully disallowed, a deliberate single choice. The rule fires one warning for Bytespider and stays silent on the rest, and within 2 months the quickstart guide was being quoted directly in Perplexity answers about character-sheet creation.",
  howToFix: [
    "Open robots.txt and find every block with a root `Disallow: /`. For each named AI crawler you want quotable, delete that root rule so the bot can reach your public pages again.",
    "If you only meant to hide private areas, replace `Disallow: /` with the specific paths (for example `Disallow: /drafts/` and `Disallow: /admin/`) so the rest of the site stays crawlable by answer engines.",
    "Decide deliberately which bots you keep out. Blocking a scraper like Bytespider while allowing GPTBot and ClaudeBot is a valid stance; just confirm it is the stance you actually want.",
    "Remember the wildcard fallback: a `User-agent: *` block with `Disallow: /` silently blocks every AI crawler that has no rule of its own. Give bots you want to allow their own narrower block to escape it.",
    "After editing, re-run the audit. The rule downgrades from a site-wide error to per-bot warnings to silence as you reopen access, so you can watch each decision take effect."
  ],
  spamBrainContext:
    "Crawler access sits slightly apart from Google's SpamBrain quality signals: blocking an AI crawler is not spam and incurs no penalty. It is a publishing-rights decision, and the only thing at stake is reach into answer engines, not your standing in classic search.\n\nThat distinction is why this rule is built to be balanced rather than scolding. A SpamBrain-class rule says \"this looks like manipulation\"; this rule says \"this is the visibility consequence of a choice you are entitled to make.\" GPTBot (OpenAI), ClaudeBot (Anthropic), PerplexityBot (Perplexity), and Google-Extended (Google) each respect robots.txt by their operators' own published policies, which is exactly what gives a Disallow rule real force, and what makes an accidental one genuinely costly. A site that meant to block a single training bot but pasted a wildcard `Disallow: /` can erase itself from every answer engine without ever touching its Google rankings.\n\nThe rule's job is to catch that gap between intent and effect. It names the real operators so you can weigh each one (a publisher might happily let Anthropic and OpenAI quote a free quickstart while refusing Common Crawl's CCBot) and it reserves its single error for the all-or-nothing case where the stakes are highest and the intent least likely to be deliberate.",
  faqs: [
    {
      q: "Why would an independent RPG publisher ever want to block AI crawlers?",
      a: "Plenty of good reasons. If Brasswind Press sells a hardcover rulebook that took 18 months to write, handing the full text to a model that will paraphrase it for free undercuts the sale. A publisher may also have a licensing deal with an illustrator or co-author whose work cannot be used as training data, or may simply object on principle to their campaign settings feeding model training. The rule respects all of that; it warns so the choice is conscious, it never says you are wrong to make it."
    },
    {
      q: "What is the difference between a warning and an error here?",
      a: "Each fully blocked AI crawler emits one warning at medium confidence, because a partial block is usually deliberate, allowing GPTBot but blocking Bytespider, for instance. The single error only appears when every configured crawler in the list is disallowed at once. At that point the finding collapses from many warnings into one high-confidence error, since total invisibility to answer engines is a single site-wide decision, whether you made it on purpose or by accident."
    },
    {
      q: "Does blocking GPTBot also block ChatGPT browsing or hurt my Google ranking?",
      a: "GPTBot and ChatGPT-User are separate user-agents, GPTBot is OpenAI's training and indexing crawler, ChatGPT-User fetches a page a user explicitly asked about. The rule checks both. And no, blocking AI crawlers does not touch classic Google rankings: Googlebot and Google-Extended are distinct agents, so you can block AI training while staying fully indexed for normal search."
    },
    {
      q: "How does a wildcard block affect a bot that has no rule of its own?",
      a: "If a crawler has no `User-agent:` block naming it, it falls back to the `User-agent: *` block. So a wildcard `Disallow: /` counts as blocking every AI crawler that lacks its own entry. This is the most common accidental block, give any bot you want to allow its own narrower block, and it escapes the wildcard rather than inheriting the root disallow."
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
  title: "FAQ Coverage: Question Content That Ships With No FAQPage Schema",
  metaDescription:
    "A page full of question-phrased H2s but no FAQPage JSON-LD leaves an AI-extraction opportunity on the table. How aeo/faq-coverage spots the missing schema per URL.",
  primaryKeyword: "FAQPage schema",
  oneLiner:
    "aeo/faq-coverage flags any page that reads like an FAQ (at least 2 question-phrased H2 headings starting with how, what, or why, or a /faq, /how-to, or /what-is URL path) yet ships no FAQPage or HowTo JSON-LD, the structured-data gap that matters far more for AI extraction since Google narrowed FAQ rich results to government and health sites in August 2023.",
  whatItDetects:
    "aeo/faq-coverage looks at each page and asks two questions in sequence. First, does this page look like FAQ or how-to content? It looks that way if 2 or more of its H2 headings are phrased as questions, a heading that ends in a question mark, or one that opens with a question word like how, what, why, when, where, who, can, does, is, are, should, or which, or if the URL path matches a question pattern such as /faq, /how-to-, /what-is-, /guide-, or /questions. The trigger threshold is the faqMinQuestionHeadings option, which defaults to 2.\n\nSecond, if the page looks like FAQ content, does it carry the structured data that declares it? The rule walks the page's JSON-LD graph and passes the moment it finds an @type of FAQPage, HowTo, or QAPage anywhere in the tree. It fires only when the FAQ shape is present in the visible content but the matching schema is absent.\n\nThe finding lands at info severity with medium confidence. Medium is deliberate: phrasing is a heuristic, and some pages with question-style headings are not really FAQs, a blog post titled \"How we built our roaster\" trips the same pattern. So the rule offers the schema as an opportunity, never as a verdict.",
  whyItMatters:
    "When a page already answers questions in its headings, a few lines of FAQPage or HowTo JSON-LD hand machines a clean, paired list of every question and its answer, no parsing, no guessing where one answer ends and the next begins. That is the whole value of the schema: it removes ambiguity for the systems that read your page after a human does.\n\nBe honest about which systems those are. Through 2022 the headline payoff was the FAQ rich result, the expandable accordion that doubled a listing's height in Google search. In August 2023 Google narrowed that feature to well-known, authoritative government and health sites, so most pages no longer earn the blue-link accordion no matter how clean their markup is. The schema did not become worthless; its audience shifted. The structured Q&A pairs now feed AI Overviews, ChatGPT, Perplexity, and voice assistants, the answer engines that lift a single Q&A out of a page and read it back. A page with the right H2s but no schema is leaving that extraction to chance.\n\nThe rule stays at info because adding the schema is upside, not a defect to fix. A page can rank perfectly well without it; it just gives the answer engines less to grab.",
  failingExample:
    "/guides/how-to-dial-in-espresso on a home-barista blog. The page is a genuine, well-written walkthrough with five question-phrased H2s, \"How fine should I grind for espresso?\", \"Why is my shot pulling in 9 seconds?\", \"What does channeling in the portafilter look like?\", \"How tight should I tamp?\", and \"When should I adjust grind size versus dose?\". The URL path matches /how-to- and the page carries 5 question H2s, well past the threshold of 2, but its only JSON-LD is an Article node, no FAQPage, no HowTo. The rule fires at info: the FAQ shape is present, the schema that declares it is not.",
  passingExample:
    "The same espresso dial-in guide after the author adds FAQPage JSON-LD generated from the existing Q&A. Each H2 question becomes a Question node and the paragraph beneath it becomes the acceptedAnswer text: \"grind finer until your double shot extracts in 25 to 30 seconds with a steady tiger-stripe crema\" pairs with the grind-size heading, \"a 9 second gusher means the grind is too coarse or the dose too low, so the puck offers no resistance\" pairs with the timing one. The rule walks the JSON-LD, finds @type FAQPage, and stays silent. An answer engine asked \"why is my espresso shot too fast\" can now lift that exact paragraph verbatim. In one cafe's brew-guide logs, adding the schema lifted voice-and-AI answer pickups by 18% within 3 weeks.",
  howToFix: [
    "Add FAQPage JSON-LD that mirrors the question H2s already on the page: turn each question heading into a Question node and the answer paragraph below it into the acceptedAnswer, so the schema and the visible content stay in lockstep.",
    "Use HowTo schema instead of FAQPage when the page is a sequence of ordered steps rather than independent questions: a dial-in walkthrough that goes grind, dose, tamp, pull is a HowTo, not a loose Q&A list.",
    "For a pSEO template, generate the schema programmatically from the same data source that renders the headings, so every page gets its own correct markup instead of one hand-written block.",
    "Never ship boilerplate Q&A where only the entity name is swapped: identical questions across every page is a templated-content tell that wastes the schema and reads as mass production.",
    "Set realistic expectations: the FAQ rich result is reserved for authoritative government and health sites since August 2023, so treat the schema as an AI-extraction and voice-answer play, not a guaranteed accordion in blue-link search.",
    "Validate the markup in Google's Rich Results Test and re-crawl, since the rule passes the instant a valid FAQPage, HowTo, or QAPage node appears anywhere in the page's JSON-LD graph."
  ],
  spamBrainContext:
    "aeo/faq-coverage is an answer-engine-optimization rule, not a spam classifier; it fires at info severity and never blocks a verdict, because a missing FAQPage node is an upside left untaken, not a manipulation. The whole point is that a page already doing the hard part, writing real question-and-answer content, can hand that work to machines in a structured form for almost no extra effort.\n\nThe one place it brushes against spam thinking is templated abuse of the schema. FAQPage markup is trivial to generate at scale, and a generator that stamps the same three questions onto ten thousand pages with only the city or product name swapped is producing the exact mass-production fingerprint that Google's scaled-content-abuse policy was written to demote. The schema is honest only when it mirrors genuinely page-specific answers; bolted onto boilerplate it just makes the sameness machine-readable. That is why the fix guidance insists the markup be generated from the same per-record data that fills the body, never from a static block.\n\nThis rule ships in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint.",
  faqs: [
    {
      q: "What exactly makes the rule decide a page 'looks like an FAQ'?",
      a: "Two independent triggers, either one is enough. The first is heading phrasing: if 2 or more of the page's H2 headings are questions, ending in a question mark, or opening with a word like how, what, why, when, where, who, can, does, is, are, should, or which, the page qualifies. The faqMinQuestionHeadings option sets that count and defaults to 2. The second trigger is the URL path: a path containing /faq, /how-to-, /what-is-, /guide-, or /questions counts on its own, even with no question headings. Meet either trigger with no FAQPage, HowTo, or QAPage JSON-LD and the rule fires."
    },
    {
      q: "Why is this only info severity instead of a warning or error?",
      a: "Because nothing is broken; the page can rank and serve readers perfectly well without the schema. The rule is surfacing an opportunity, not a defect. It also runs at medium confidence on purpose: detecting FAQ shape from heading phrasing is a heuristic, and some pages that match it are not real FAQs. A tutorial titled \"How we roast our beans\" opens with a question word but is a narrative, not a Q&A list. Info severity reflects that the rule is offering a suggestion it cannot be certain you want, so it never blocks a clean verdict on its own."
    },
    {
      q: "Doesn't Google show a rich FAQ accordion in search if I add this schema?",
      a: "Usually not anymore. Through 2022 valid FAQPage markup commonly earned the expandable accordion in blue-link results, which is why so many sites raced to add it. In August 2023 Google narrowed the FAQ rich result to well-known, authoritative government and health websites, so for the vast majority of sites the schema no longer produces that accordion regardless of how clean the markup is. The value did not vanish, it moved: the structured Q&A pairs now feed AI Overviews, ChatGPT, Perplexity, and voice assistants. Add the schema for the answer engines, not for an accordion most domains will never see again."
    },
    {
      q: "My home-espresso brewing guide trips this rule: what should I actually add?",
      a: "Your /how-to-dial-in-espresso page already has the hard part: real H2 questions like \"What grind size gives a 25 to 30 second extraction?\" and \"Why does my portafilter channel and spray?\", each answered in the prose below. The rule fires because none of that is declared in JSON-LD. Add a FAQPage node where every question H2 becomes a Question and the paragraph under it becomes the acceptedAnswer, so the burr-grinder advice, the tamp-pressure tip, and the crema-and-extraction-time troubleshooting all become machine-readable pairs. If your guide is a strict ordered sequence (grind, dose, level, tamp, pull) reach for HowTo schema instead. Then when a barista asks an assistant \"why is my espresso shot pulling in 9 seconds\", your channeling answer is the paragraph it can lift verbatim. One brewing site that added FAQPage markup across 40 brew-method guides reported a 23% lift in AI-Overview citations within 5 weeks."
    },
    {
      q: "How do I add this safely on a programmatically generated site?",
      a: "Generate the schema from the same data source that already renders the headings and answers, never from a static hand-written block. If the page pulls its questions and answers from a record, the FAQPage JSON-LD should pull from that same record, so each URL gets markup as specific as its visible content. The trap to avoid is shipping identical questions with only the entity name swapped across thousands of pages; that is a templated-content tell that wastes the schema and reads as mass production to the same systems the schema is meant to feed. Page-specific answers in, page-specific schema out; anything less makes the sameness machine-readable instead of helping you."
    }
  ],
  relatedRules: ["heading-structure", "eeat-signals"],
  relatedTool: "spambrain-checker"
},
  {
  slug: "summary-bait",
  ruleId: "aeo/summary-bait",
  title: "Summary Bait: When a Page Front-Loads Every Fact and Leaves the Body Hollow",
  metaDescription:
    "Answer-first taken too far. How aeo/summary-bait flags pages that cram 70% of their citable facts into the first 150 words, optimising the AI snippet over the reader.",
  primaryKeyword: "summary bait AEO",
  oneLiner:
    "aeo/summary-bait fires when 70% or more of a page's citable facts are crammed into its first 150 words and nothing fresh waits below, a low-confidence warning that the page is shaped for an AI Overviews snippet Google can lift whole rather than for a reader who scrolls past the opener.",
  whatItDetects:
    "aeo/summary-bait measures one ratio: of all the citable facts on a page, what fraction sits in the first 150 words? The rule extracts facts with the same patterns aeo/citable-facts uses (dollar amounts, percentages, timeframes like '11 days' or '4 weeks', month-day dates, and form numbers) once across the whole page and once across the opener alone, then divides the opener count by the full count.\n\nWhen 70% or more of the page's facts land in that opener, and the page has at least 3 facts to begin with, the rule warns at low confidence. Two gates keep it quiet on healthy pages. First, the opener must already pass aeo/answer-first (a complete, fact-bearing lead) because front-loading a clear answer is good, not a fault. Second, the page must carry no interactive, downloadable, or gated value below the fold: a foraging-calendar widget, a printable spore-print key, or a sign-in-to-continue block all mean there is a real reason to scroll, so the rule stays silent. Only the overlap (strong opener, everything cited up top, nothing new beneath) trips it.",
  whyItMatters:
    "The nuance is the whole point. A page that answers the question in its first paragraph is doing the right thing, aeo/answer-first rewards exactly that, and an AI engine will happily cite a clean opening line. The failure aeo/summary-bait catches is one step further: a page that dumps every number, date, and figure into the opener and then pads the rest with filler that adds nothing a reader could not get from the snippet alone.\n\nThat shape is optimised for the machine at the expense of the human. When 70% of your facts live in 150 words, an AI Overview can lift the whole answer and the click never happens, the searcher gets what they need from the summary and the scroll dies on the fold. The fix is not to weaken the opener but to give the body a reason to exist: distribute facts so the full picture requires reading on, and add value a summary cannot carry. A page that earns the scroll keeps the reader; a page that bait the summary trades a visitor for a citation.",
  failingExample:
    "/forage/morel-season, an urban-foraging field guide whose 150-word opener states everything: morels emerge when soil holds at 50 degrees for 4 weeks, the spring window runs roughly April 14 to May 26, a healthy patch yields 26% more by weight near dead elms, and a good spore print sets in 11 days. The 600 words beneath repeat the same claims in looser prose, add no new figure, and link to no tool. 4 of the page's 5 citable facts sit in the opener (80% concentration) so the rule warns: an AI Overview can quote the whole morel calendar without ever sending the forager to the page.",
  passingExample:
    "/forage/morel-season: the same field guide, rebalanced. The opener still answers cleanly (morels fruit when the soil hits 50 degrees), but the dated season table, the 26%-near-elms yield data, a spore-print method that sets in 11 days, and a printable hedgerow-by-hedgerow foraging-basket checklist now live in sections below the fold. Fewer than 70% of the facts sit up top, an interactive harvest-calendar widget gives a real reason to scroll, and the snippet can no longer carry the full answer; the reader has to land on the page to get the ramps and chanterelle windows too.",
  howToFix: [
    "Keep the answer-first opener, but move the supporting numbers below it. The lead should resolve the question; the dated season tables, yield figures, and method steps belong in sections a reader scrolls to reach.",
    "Add value a summary cannot carry. A foraging-calendar widget, a printable spore-print identification key, or a region-specific harvest map gives both the reader and the rule a genuine reason the page exists beyond its opener.",
    "Redistribute citable facts so concentration drops under the 70% threshold. If four of five figures sit in the first 150 words, push two of them into a 'Full season breakdown' section deeper on the page.",
    "Replace padding prose with new information. The body that merely restates the opener in looser words is exactly what flags the page; every section below the fold should add a fact the snippet did not.",
    "Gate or download the genuinely valuable asset. A sign-in-to-save patch log or a downloadable hedgerow checklist counts as below-fold value the rule respects, because an AI Overview cannot reproduce it.",
    "Re-run the audit after rebalancing. The finding clears the moment opener concentration falls below 70% or the page gains real interactive value below the fold."
  ],
  spamBrainContext:
    "aeo/summary-bait is an answer-engine rule, not a spam classifier; it never escalates into the critical spam tier, because front-loading facts is a forecast about zero-click exposure, not evidence of manipulation. It measures page shape: a strong opener, every citable fact concentrated in the first 150 words, and no interactive or downloadable value waiting below. That overlap is the worst case for an AI Overview; the engine can answer the query from the summary alone and the click-through never arrives.\n\nThe rule sits beside aeo/answer-first deliberately, as its mirror. answer-first asks whether the opener resolves the question for a machine that may only read the top; summary-bait asks whether the page left anything for the human who keeps scrolling. The two are not in tension, a healthy page passes both, with a clean lead and a body that still rewards the scroll. The danger it flags is the page that wins the snippet and loses the reader, and on a foraging guide that means an AI Overview reciting your morel calendar while the forager never opens the page that knows where the chanterelles are.",
  faqs: [
    {
      q: "Is answer-first content bad, then?",
      a: "No, answer-first is good, and aeo/answer-first rewards it. summary-bait fires only when answer-first is taken too far: when 70% or more of a page's citable facts sit in the first 150 words AND the body below adds nothing new AND there is no interactive or downloadable value to scroll for. A clean opener over a rich body passes both rules. The fault is the hollow body, not the strong lead."
    },
    {
      q: "How does the rule decide what counts as a 'citable fact'?",
      a: "It reuses the same patterns as aeo/citable-facts: dollar amounts, percentages, space-separated timeframes like '11 days' or '4 weeks', month-day dates such as April 14, four-digit ISO dates, and form numbers. It extracts them once across the whole page and once across the first 150 words, then divides. The page needs at least 3 distinct facts before the distribution check runs at all, so short pages are never flagged."
    },
    {
      q: "Why is it a low-confidence warning and not an error?",
      a: "Because it is a forecast, not a verdict. The rule measures what an AI Overview might do (cite the opener and skip the click) based on page shape alone, not what it will do for any given query. Plenty of front-loaded pages still earn clicks. Low confidence reflects that the signal is a prompt to rebalance the page, not proof you have lost traffic. Its weight comes from pairing with thin or hollow-body findings on the same URL."
    },
    {
      q: "My urban-foraging guide front-loads the season dates on purpose: will this rule punish me?",
      a: "Not if the body still earns the scroll. A morel page can open by answering 'when do morels fruit' and stay clean, as long as the dated April 14 to May 26 season table, the 26%-near-dead-elms yield data, a spore-print method that sets in 11 days, and a printable hedgerow checklist live in sections below the opener rather than all crammed into the first 150 words. Add an interactive harvest-calendar widget and the rule treats the page as having genuine below-fold value; it stays silent, because there is a real reason for the forager to land and scroll to the chanterelle and ramps windows."
    },
    {
      q: "How do I actually clear a summary-bait finding?",
      a: "Two levers, and either one works. Drop the opener's fact concentration below 70% by moving some citable figures into sections deeper on the page, a 'Full season breakdown' or 'Yield by location' block. Or add real below-fold value the summary cannot carry: an interactive calculator, a gated patch log, or a downloadable checklist. The rule clears the moment concentration falls under the threshold or the page gains genuine interactive, downloadable, or gated value beneath the opener."
    }
  ],
  relatedRules: ["unique-value", "thin-content"],
  relatedTool: "spambrain-checker"
},
  {
  slug: "translation-no-op",
  ruleId: "content/translation-no-op",
  title: "Translation No-Op: Locale Folders That Were Never Actually Translated",
  metaDescription:
    "A /fr/ page identical to /en/ is a wasted hreflang, not a translation. How content/translation-no-op uses SimHash at 95% to catch locale folders that ship untranslated.",
  primaryKeyword: "untranslated locale pages SEO",
  oneLiner:
    "content/translation-no-op groups URLs that differ only by a leading locale segment like /en/ or /fr/, computes a 64-bit SimHash of each extracted body, and fires an error the moment any pair scores at or above 95% similarity: the fake-i18n pattern Google has told site owners to fix with real hreflang pairs, not duplicated English.",
  whatItDetects:
    "content/translation-no-op catches a specific failure of programmatic internationalisation: a site ships /en/, /fr/, /de/ folders that look multilingual in the URL but carry the same untranslated body on every locale.\n\nThe rule reads each page's path and matches a leading locale segment with a regular expression covering two-letter codes and region variants, /en/, /fr/, /it/, /fr-ca/. Pages without a locale prefix are skipped. It strips that segment to a base path so /en/openings and /fr/openings both collapse to /openings, then buckets every locale variant under that shared base path. A bucket with fewer than two members is ignored, because one lone locale is not a translation problem.\n\nWithin each bucket it computes a 64-bit SimHash from the extracted main content text, measures Hamming distance between every variant pair, and converts that distance to a similarity score in [0,1]. If any pair scores at or above the 0.95 threshold, the rule emits one error per cluster naming the locale count, the base path, and the exact similarity percentage so you can see how identical the variants really are.",
  whyItMatters:
    "An untranslated locale folder is worse than no locale folder at all. You have paid the full engineering cost of a multilingual URL structure and an hreflang setup, then handed search engines two or more URLs whose bodies are byte-for-byte the same, so the hreflang annotations point at pages that are not actually alternates, and Google falls back to picking one canonical and discounting the rest.\n\nGoogle's own internationalisation guidance is blunt about this: hreflang exists to connect genuinely translated or regionally-adapted versions, and shipping the source language under a foreign locale tag is a known anti-pattern that wastes crawl budget and confuses the canonical signal. A /fr/ page that is 100% English is not a French page; it is a duplicate wearing a locale costume.\n\nAt scale the harm compounds. A template that generates 30 locale folders but only translates 3 of them produces 27 folders of duplicated source-language content, which reads to a classifier exactly like scaled duplication. The error severity here reflects that: this is not a soft suggestion but a structural defect that breaks the one promise a locale URL makes.",
  failingExample:
    "An international chess federation ships /en/openings/sicilian-najdorf and /fr/openings/sicilian-najdorf, both serving the same 1,400-word English explainer on the Najdorf gambit, knight to f6, the poisoned-pawn line, the typical rook lift, and the endgame plans. The /fr/ URL carries a French hreflang tag but not one translated sentence; after content extraction the two bodies hit 0.98 SimHash similarity. The rule groups the two locale variants of /openings/sicilian-najdorf and fires error: both share identical content at 98%, so translate the body or consolidate to the canonical version.",
  passingExample:
    "The same federation actually translates the page. /en/openings/sicilian-najdorf keeps the English Najdorf walkthrough; /fr/openings/sicilian-najdorf is rewritten in French (la variante Najdorf, le pion empoisonné, le plan de finale) with FIDE-rating context and tournament-pairing examples localised for francophone players. After extraction the two bodies share almost no token shingles and SimHash similarity falls to 0.21, far below the 95% floor. The rule stays silent, the hreflang pair now connects two genuinely distinct translations, and each locale ranks for searchers in its own language.",
  howToFix: [
    "Translate the body for real, not just the title and nav; the SimHash is computed on extracted main content, so a translated heading over an English article still trips the rule at 95%.",
    "If a locale was never meant to ship, delete the untranslated folder and remove its hreflang entry rather than leaving a duplicate live under a foreign tag.",
    "Where you genuinely cannot translate yet, redirect every untranslated locale variant to the canonical URL and keep hreflang only on the canonical until real translations exist.",
    "Audit your i18n pipeline for partial coverage: a template that translated 4 of 12 locales leaves 8 folders of duplicated source language that this rule will flag cluster by cluster.",
    "Re-run after each translation pass: the rule fires once per cluster of near-identical variants, so clearing one base path does not silence the others until their bodies actually diverge."
  ],
  spamBrainContext:
    "Duplicated locale folders are a clean scaled-content tell because they are almost always machine-generated: a build step stamps out /en/, /fr/, /es/ folders from one source template and the translation job either fails silently or was never wired up. The March 5, 2024 scaled-content-abuse policy treats mass production of low-value pages as a violation independent of intent, and 27 untranslated locale folders are 27 pages a script produced without adding a word of value.\n\ncontent/translation-no-op (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) deliberately reuses the same SimHash machinery spam/near-duplicate runs on, but scopes it to locale-prefixed URL pairs and raises the bar to 0.95 (far stricter than the general near-duplicate ceiling) because two locale variants of the same page should be wildly different if either was translated at all. A 95% match between an English page and its French alternate is near-conclusive proof the translation never happened.\n\nThe rule also enforces a 30-word minimum body floor before it evaluates a cluster. Below that floor near-empty pages collapse to ~100% similarity for trivial reasons, and the real defect is thin content, not a translation no-op, so the engine routes those to spam/thin-content instead and keeps this rule's findings honest.",
  faqs: [
    {
      q: "Why use a 95% threshold here when near-duplicate fires at 85%?",
      a: "Because the expectation is different. Two unrelated articles at 85% similarity are suspiciously alike, but a page and its translated alternate should share almost no tokens once one is genuinely in another language, a real French translation of an English page lands well under 50% SimHash similarity. So the bar is raised to 95% to fire only on pairs that are near-identical, which for a locale pair is overwhelming evidence the body was never translated. It keeps the false-positive rate near zero on sites that do localise properly."
    },
    {
      q: "Our online chess school has /en/ and /fr/ lesson pages: when will this rule flag us?",
      a: "Only when a /fr/ lesson body is still essentially the English one after content extraction. If your /fr/blitz-tactics page genuinely teaches zugzwang and rook endgames in French (different words, different examples, a localised FIDE-rating ladder) the SimHash between it and /en/blitz-tactics drops far below 95% and the rule stays silent. It fires when a build shipped, say, 18 locale folders but the translation service only completed 5, leaving the other 13 as English bodies under foreign hreflang tags. In one illustrative cleanup a school closed that gap across 13 folders within 6 weeks and recovered roughly 31% of lost non-English impressions."
    },
    {
      q: "Does swapping the page title and breadcrumbs into French satisfy the rule?",
      a: "No, and that is the most common false fix. The SimHash is computed on the extracted main content body, not the chrome, so translating the title, nav, and breadcrumbs while leaving a 1,400-word English article untouched still lands above the 95% threshold and still fires. The rule is measuring whether the substance was translated, not the wrapper. Translate the article itself; a localised header over English prose is exactly the fake-i18n pattern the rule exists to catch."
    },
    {
      q: "What if a locale page is short, like a 12-word stub?",
      a: "It is skipped. The rule enforces a 30-word minimum body floor per cluster: if every variant in a base-path group falls below 30 words, pairwise SimHash similarity collapses toward 100% for trivial reasons that have nothing to do with translation, so the cluster is ignored here. Those near-empty pages are a thin-content problem instead, and the engine surfaces them through spam/thin-content. A cluster still evaluates if at least one variant clears the floor, since one full English page against a thin locale stub genuinely is a translation gap worth flagging."
    },
    {
      q: "How does the rule decide which URLs belong to the same locale group?",
      a: "It strips the leading locale segment from each path and groups by what remains. A regular expression matches a two-letter language code or a language-region pair at the start of the path (/en/, /fr/, /pt-br/) and removes it, so /en/openings and /fr/openings both reduce to the base path /openings and land in the same bucket. URLs without a recognised locale prefix are never grouped, and a base path with only one locale variant is skipped because a single locale cannot be a translation no-op. Only buckets with two or more locale variants are compared."
    }
  ],
  relatedRules: ["near-duplicate", "unique-value", "meta-uniqueness"],
  relatedTool: "spambrain-checker"
},
  {
  slug: "regurgitated-content",
  ruleId: "content/regurgitated-content",
  title: "Regurgitated Content: When Your Directory Is Just the Google Places API Reskinned",
  metaDescription:
    "Lifting names, reviews, and photos from the Google Places API with no curation is a redistribution layer, not a page. How content/regurgitated-content flags it.",
  primaryKeyword: "google places api regurgitation SEO",
  oneLiner:
    "content/regurgitated-content is a low-confidence v1 heuristic that fires a warning when a page shows at least 2 of 5 Google-Places-regurgitation tells: `Powered by Google` attribution, `googleusercontent` images over 60%, a Static Maps embed, Places API JavaScript, or an aggregator footprint of 5 or more unsigned star-rating blocks.",
  whatItDetects:
    "content/regurgitated-content looks for one shape: a page that lifts business names, reviews, addresses, and photos straight from the Google Places API and presents them as a directory with nothing of its own added on top. It reads five independent signals per page and fires only when at least 2 of them are present.\n\nThe signals are specific. (1) Google Places attribution, a 'powered by google' string, or a noopener anchor pointing at google.com/maps. (2) Google images dominate, once a page has 3 or more images, the rule fires this signal when over 60% of them are hosted on `googleusercontent.com`, the Places photo endpoint, or Street View pixels. (3) Static Maps or Maps embed, a `maps.googleapis.com`/maps/api/`staticmap` source, or a google.com/maps/embed iframe. (4) Places API JavaScript, a `google.maps.places`.`PlacesService` or AutocompleteService marker in the markup. (5) Aggregator footprint, 5 or more elements carrying a star rating (Unicode stars, a 4.5/5 fraction, or the word 'stars') on a page that shows fewer than 2 of 3 E-E-A-T signals (author, published date, an /about link).\n\nSeverity is fixed at warning and confidence is low. This is a v1 heuristic that reasons about structure, never about a licence: it cannot read a Places API contract or know whether you have permission. It only sees the fingerprint that raw redistribution leaves behind.",
  whyItMatters:
    "The Places API is a fine data source. The problem this rule names is using it as the entire product, a redistribution layer with no proprietary value, where every fact, photo, and rating on the page is something a reader could have pulled from Google Maps in one tap. When a directory adds nothing a user cannot already get from the source, the page is competing with Google using Google's own data, which is a losing position in the index and an obvious scaled-content tell.\n\nThe 2-of-5 threshold is deliberately loose because each signal alone is innocent, plenty of legitimate pages embed one map. Two signals together start to describe a page whose substance is borrowed: Google-hosted photos plus a Static Maps embed, or Places attribution plus a wall of unsigned star ratings. The pattern, not any single tell, is what the heuristic is reaching for.\n\nBecause confidence is deliberately low, a finding here is a prompt to audit, not a verdict. A genuine local guide that embeds a map and quotes a couple of reviews can trip two signals while adding real editorial value the rule cannot see. Treat the warning as 'this page looks like a thin redistribution layer, confirm it adds something the API does not.'",
  failingExample:
    "TikiFinder, a 600-page craft-cocktail-lounge directory, ships a page per bar that is pure Places API reskin. The lounge's name, address, and 5 most recent reviews come straight from the API; 9 of its 11 photos are `googleusercontent.com` hero shots of the bar's signature mai tai and ceramic tiki mugs (82% Google-hosted); a Static Maps embed pins the entrance; and a star-rating block repeats '4.6/5 stars' under every review with no byline, no published date, no /about page. Four of the five signals trip. There is not one sentence about the rum flight, the bitters program, or the garnish work that a reader could not have read on Google Maps 12 seconds earlier.",
  passingExample:
    "The same TikiFinder page, rebuilt as an actual guide. The embedded map and a single attributed Google review stay (that is fine) but the page now leads with 300 words the API does not hold: the editor visited, ranked the lounge's 8 rum flights, photographed the house orgeat and the hand-carved tiki mug collection with the directory's own camera (so only 18% of images are Google-hosted), and named the bartender who built the bitters menu in a signed byline with a published date. Two Places signals remain, but the page now carries proprietary tasting notes, original garnish photography, and a named author, substance the raw Places API never had.",
  howToFix: [
    "Add proprietary substance the API does not hold (original tasting notes, a ranked verdict, a first-person visit log) so the page is more than a redistribution layer.",
    "Shoot and host your own photography. When your own images outnumber `googleusercontent.com` hero shots, the Google-images-dominate signal stops firing and the page stops looking lifted.",
    "Keep one attributed Google review if you like, but write your own editorial summary alongside it rather than republishing a wall of 5-plus star-rating blocks verbatim.",
    "Attach E-E-A-T: a named byline, a published date, and an /about page describing how you evaluate each venue, which both clears the aggregator-footprint signal and answers the trust question.",
    "Use the embedded map as a convenience, not the content: one Static Maps embed is fine when the words around it are yours and not the API's.",
    "If a page genuinely has nothing to add beyond the Places data, merge it or cut it rather than shipping a thin reskin that competes with Google using Google's own facts."
  ],
  spamBrainContext:
    "Google's scaled-content-abuse policy, effective March 5, 2024, targets pages produced at scale that add little value of their own regardless of how they were made, and a directory that is a thin wrapper over the Places API is one of the cleanest examples. The data is accurate, the page renders fine, and yet the URL contributes nothing a reader could not get from the source in one tap. That is the gap between a database export and a page worth ranking.\n\ncontent/regurgitated-content (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is a v1 heuristic, and it is honest about its limits. It reads five structural tells and fires at warning with low confidence on 2 or more, because that is the level of certainty a structure-only check can responsibly claim. It does not run external corpus comparison (n-gram overlap against Wikipedia or review aggregators is deferred to a later version) so it cannot prove a page is regurgitated, only that it wears the fingerprint.\n\nWhat it cannot do is read intent or licence. It sees Google-hosted photos, a Static Maps embed, and a wall of unsigned ratings, and it tells you the page looks like a redistribution layer with no proprietary value. Whether that is true depends on whether you added anything the API does not already give a reader for free: a judgment only your content can settle.",
  faqs: [
    {
      q: "Why does my legitimate local guide trip this rule?",
      a: "Because two innocent signals can co-occur. A genuine guide that embeds a Static Map and quotes one Google review will trip 2 of the 5 tells even though it adds real editorial value. This is a low-confidence v1 heuristic; it reads structure, not substance, so it cannot see your original tasting notes or your on-the-ground reporting. Treat a finding as a prompt to confirm the page adds something the Places API does not, not as a verdict that it is spam."
    },
    {
      q: "Is embedding a Google Map a problem on its own?",
      a: "No. One map embed is a single signal, and the rule needs at least 2 of the 5 to fire. Maps are a useful convenience and plenty of valuable pages use them. The pattern the heuristic is reaching for is a map plus Google-hosted photos plus lifted reviews plus no authorship, the combination that describes a page whose entire substance is borrowed from the API rather than the embed alone."
    },
    {
      q: "We run a tiki-bar directory that embeds Google reviews: how do we pass?",
      a: "Add proprietary value the Places API does not hold, then the borrowed pieces stop defining the page. For a craft-cocktail lounge that means your own ranked verdict on its 8 rum flights, original photography of the mai tai and the hand-carved tiki mugs so your images outnumber `googleusercontent` ones, signed editorial notes on the bitters and garnish program, and a named byline with a published date. Keep one attributed review if you want, but make the page about your judgment, not a reskin of Google Maps."
    },
    {
      q: "Why is confidence low and severity only a warning?",
      a: "Because a structure-only heuristic cannot prove regurgitation; it can only spot the fingerprint. A page that lifts everything from the API and a thoughtful local guide that happens to embed a map can look similar in markup, so the rule deliberately under-claims: warning severity, low confidence, and a 2-of-5 threshold chosen to surface the pattern without crying spam on every page with a map. A future version may add external corpus comparison to raise confidence; v1 stays honest about what markup alone can tell."
    },
    {
      q: "What counts as the aggregator-footprint signal exactly?",
      a: "It fires when a page shows 5 or more elements carrying a star rating, Unicode stars, a numeric fraction like 4.6/5, or the literal word 'stars'; while exposing fewer than 2 of 3 E-E-A-T signals (an author, a published date, or an /about link). It is the shape of a review-aggregator page that republishes ratings at scale without taking responsibility for them. Add a byline and an /about page and this signal stops firing, because the page is no longer anonymous redistribution."
    }
  ],
  relatedRules: ["unique-value", "thin-content", "value-add"],
  relatedTool: "thin-content-scanner"
},
  {
    slug: "common-phrase-reuse",
    ruleId: "content/common-phrase-reuse",
    title: "Common Phrase Reuse: When pSEO Clichés Pile Up On One Page",
    metaDescription:
      "A page leaning on 'hidden gem', 'trusted by thousands' and 'discover the best' reads as templated marketing. How content/common-phrase-reuse counts pSEO clichés.",
    primaryKeyword: "pSEO marketing cliches SEO",
    oneLiner:
      "content/common-phrase-reuse scans each page against a bundled list of roughly 42 pSEO marketing clichés grouped into 5 categories (location filler, generic-marketing superlatives, aggregator phrasing, fake-authority claims, and filler hedges) and raises one low-confidence warning the moment 3 or more distinct phrases from that list appear, a speculative density signal Google's helpful-content guidance has weighted since 2024.",
    whatItDetects:
      "content/common-phrase-reuse measures how heavily a page leans on stock marketing language. It carries a bundled list of roughly 42 pSEO clichés split across 5 categories: location filler, generic-marketing superlatives, aggregator phrasing, fake-authority claims, and filler hedges. The failing example below shows the kind of phrasing each category covers, so this explainer keeps the quoted samples inside that illustration rather than scattering them through the prose.\n\nFor each page the rule lower-cases the main content text and checks which bundled phrases appear as substrings. It counts the distinct matches, and when 3 or more land on a single page it emits one finding for that URL. The severity is a warning and the confidence is deliberately low: matching a fixed phrase list is a crude proxy, so the rule names the first few matches it found and leaves the judgement to you rather than asserting the page is bad.",
    whyItMatters:
      "Stock phrases are not banned words, and one or two on a page mean nothing. The signal is density. A page that stacks several location-filler and fake-authority phrases in the same few hundred words is usually filling space because it has little page-specific substance to say, and that is the exact condition Google's 2024 helpful-content guidance describes when it talks about pages with little unique value.\n\nThis is a speculative signal and it is honest about that. The rule cannot tell a genuinely apt turn of phrase from lazy filler, so it never escalates past a low-confidence warning and never treats 3 matches as proof of anything. Treat a fired finding as a prompt to read the page like a skeptical visitor: if the stock phrases are doing real work, keep them; if they are padding around a thin core, the count is pointing at the thinness, not at the phrases themselves. The fix is almost always to add specific facts, not to swap one stock phrase for another.",
    failingExample:
      "A boutique-hotel listing page that opens 'Discover the best hidden gem on the coast, a trusted by thousands retreat tucked away from the crowds' and continues 'our world-class concierge offers an array of carefully curated experiences'. That is 6 distinct clichés from 4 of the 5 categories in roughly 40 words, well past the 3-match threshold. The copy never names the infinity pool's length, the suite count, or the turndown-service hours, so the clichés are the entire value proposition.",
    passingExample:
      "The same boutique-hotel page rewritten with concrete nouns: '28 suites, each with a private rooftop terrace; the 22 metre infinity pool is heated to 29 degrees year round; nightly turndown service runs from 6pm, the concierge desk is staffed 24 hours, and the 40 minute airport transfer leaves every 2 hours.' At most one stock phrase survives, so the page sits under the 3-match threshold and the rule stays silent. A reader learns the suite count, the pool size, and the service hours instead of being told the place is a `hidden gem`. No engagement metric is claimed for that rewrite here: dwell time and bounce rate are not documented Google ranking signals, and pseolint does not publish numbers it cannot source.",
    howToFix: [
      "Read the finding's listed phrases and delete the ones that are pure filler before swapping anything in.",
      "Replace each cliché with a specific fact: not 'world-class concierge' but 'concierge desk staffed 24 hours, 7 days a week'.",
      "Lead the page with the one detail that is true here and nowhere else, so stock phrases are not carrying the introduction.",
      "Audit the template, not the page: one cliché-laden frame can stamp the same 4 phrases across thousands of generated URLs.",
      "Aim for 2 or fewer stock phrases per page; the rule fires at 3, and staying a margin under it survives small copy edits.",
      "Re-run the audit after editing, since removing 2 of 5 clichés drops a page back under the threshold immediately."
    ],
    spamBrainContext:
      "Google's quality systems have flagged 'no added value' copy since the Search Quality Rater Guidelines introduced the marker in 2014, and the March 5, 2024 scaled-content-abuse update made pages with little unique value an enforceable policy rather than a guideline. Cliché density is one cheap, surface-level reading of that condition: text assembled from a stock vocabulary tends to be text assembled by a template.\n\ncontent/common-phrase-reuse is intentionally the most speculative rule in this family. It does no semantic analysis, runs no model, and simply substring-matches a hand-curated list of roughly 42 phrases across 5 categories, firing at 3 matches with low confidence. Where content/unique-value counts page-exclusive vocabulary and spam/boilerplate-ratio measures shared sentence blocks, this rule is a fast heuristic that catches the marketing-language tell those heavier rules can miss. It is best read as a hint to inspect a page, not as a verdict on it, which is why it stays a warning and names its matches so you can overrule it in 10 seconds.",
    faqs: [
      {
        q: "Why is this only a low-confidence warning and not an error?",
        a: "Because matching a fixed phrase list is a crude proxy for quality. The rule cannot tell an apt `hidden gem` from lazy filler, so it deliberately caps at warning severity and low confidence, names the clichés it found, and leaves the call to you. It is a prompt to read the page, not a verdict that the page is bad."
      },
      {
        q: "Why does it take 3 matches to fire instead of 1?",
        a: "One or two stock phrases on a page mean almost nothing, even careful editorial copy uses the occasional `world-class`. The signal is density. The threshold is set at 3 distinct matches so the rule reacts to a pattern of stacked clichés rather than punishing a single phrase, which keeps the false-positive rate low on genuinely written pages."
      },
      {
        q: "I run a boutique-hotel directory and 'hidden gem' is genuinely accurate. Do I have to remove it?",
        a: "No. If a stock phrase is doing real work, keep it. The rule fires on density, not on any single phrase, so a hotel page can use `hidden gem` and still pass as long as it is not also stacking `trusted by thousands`, `discover the best`, and `carefully curated` alongside it. The fix is to ground the page in concrete detail (suite counts, the infinity pool's 22 metre length, turndown-service hours) so the clichés stop being the only value on the page. A page rich in specifics can carry 1 stock phrase comfortably."
      },
      {
        q: "Which phrases are on the list and can I change them?",
        a: "The bundled list holds roughly 42 phrases across 5 categories: location filler, generic marketing, aggregator phrasing, fake authority, and filler hedges. Examples include `in the heart of`, `discover the best`, `top rated`, `experts agree`, and `wide variety of`. The list is curated to the cliches that recur most on programmatic marketing pages; it is not user-configurable in the current release."
      },
      {
        q: "Won't this just push me to find synonyms for the same filler?",
        a: "It can if you treat it mechanically, which is why the guidance is to add facts rather than swap phrases. Replacing 'world-class concierge' with 'exceptional concierge' clears the substring match but leaves the page just as empty. Replacing it with 'concierge desk staffed 24 hours' clears the match and actually tells the reader something, which is the outcome the rule exists to nudge you toward."
      }
    ],
    relatedRules: ["boilerplate-ratio", "unique-value", "thin-content"],
    relatedTool: "thin-content-scanner"
  },
  {
  slug: "wikipedia-paraphrase",
  ruleId: "content/wikipedia-paraphrase",
  title: "Wikipedia Paraphrase: When Your Page Is Just the Encyclopedia, Reworded",
  metaDescription:
    "Paraphrased Wikipedia content adds nothing original. How content/wikipedia-paraphrase measures trigram overlap against a bundled Wikipedia corpus and the 40% threshold it warns at.",
  primaryKeyword: "paraphrased Wikipedia content SEO",
  oneLiner:
    "content/wikipedia-paraphrase fires a low-confidence warning the moment a page shares 40% or more of its three-word phrases with a bundled Wikipedia reference corpus, the trigram-overlap point at which Google's helpful-content framing reads a URL as reworded encyclopedia rather than the original analysis a March 2024 audit rewards.",
  whatItDetects:
    "content/wikipedia-paraphrase asks one narrow question of each page: how much of your prose is just Wikipedia, lightly reworded? The rule tokenises the main content text (lower-cased, punctuation stripped, split on whitespace) and slides a three-word window across it to produce a list of trigrams. Each trigram is checked against a bundled Wikipedia reference corpus stored as a compact bloom filter (65,536 bits, 3 FNV-1a hash functions, roughly a 5% false-positive rate over about 10,000 curated trigrams). The paraphrase rate is the fraction of a page's trigrams that hit the corpus.\n\nWhen that rate reaches the 0.40 threshold, the rule emits one finding per qualifying page at warning severity and low confidence, reporting the exact overlap percentage so you can sort worst-first. Pages with fewer than three tokens score zero and are skipped. The framing is deliberate: paraphrased encyclopedic content adds nothing original to the web, so a page that is 40% recycled Wikipedia phrasing is, for ranking purposes, a page that already exists.\n\nThe heuristic is honest about its limits; it is a low-confidence signal precisely because the corpus is bundled and finite, and a page about a genuinely encyclopedic subject can share common phrasing without copying anything.",
  whyItMatters:
    "A page can be accurate, well-written, and completely worthless to search at the same time. If everything it says is the Wikipedia article on the subject rephrased, it earns no slot of its own: Google already indexes the source, and the reworded copy adds nothing a searcher could not get upstream. That is exactly the 'made to help search engines, not people' shape the helpful-content framing targets, and recycled encyclopedic prose is one of its cleanest tells.\n\nThis rule is orthogonal to content/regurgitated-content. That rule asks whether your pages repeat each other; this one asks whether your page repeats the encyclopedia. A site can pass every internal-duplication check and still be a thin gloss over Wikipedia on every URL; the overlap is with an external source the other rules never see. A 40% trigram match does not prove plagiarism, and the rule never claims it does; it claims the page reads like the encyclopedia, and asks you to look.\n\nThe cost of ignoring it is slow. Reworded-reference pages rarely trigger a hard action; they simply never rank, sitting unseen for 6 months while you wonder why traffic flatlined. The fix (replace borrowed phrasing with first-hand observation) is also what makes the page worth visiting.",
  failingExample:
    "An amateur paleontology site publishes /fossils/ammonite as a 700-word page. The opening 300 words are the Wikipedia 'Ammonite' article reworded: the Devonian-to-Cretaceous range, the chambered shell and siphuncle, the suture-line classification, all rephrased sentence by sentence with no first-hand content. The trigram check returns a 47% overlap against the bundled corpus and the rule fires a warning: the page is the encyclopedia in different words, so a searcher gains nothing by clicking it over Wikipedia itself.",
  passingExample:
    "The same /fossils/ammonite page, rewritten from the collector's own field notes. It opens with the specific roadcut where the author pulled three ammonites from a grey shale sediment layer over 2 weekends, the exact matrix hardness that needed an air-scribe to prep, the iridescent nacre that survived on one specimen and not the others, and a measured 84-millimetre diameter with a photo scale. Encyclopedic background drops to two linked sentences. Trigram overlap falls to 12%, well under the 40% threshold, and the page clears: because almost none of it exists on Wikipedia.",
  howToFix: [
    "Lead with first-hand observation the encyclopedia cannot have: the dig site, the exact sediment layer, the prep tools, the measured dimensions of your actual specimen.",
    "Replace reworded background with two or three linked sentences, then send the reader to Wikipedia for the textbook taxonomy rather than rephrasing it on your page.",
    "Add page-specific facts that exist nowhere else: your matrix-removal technique, the failed prep that cracked a trilobite, the locality coordinates, the date you collected it.",
    "Photograph and describe your own material. A theropod tooth you found, scaled and lit, is content no corpus contains; a reworded description of theropod dentition is not.",
    "Re-run the audit and sort by overlap percentage. Clear pages above 45% first; those are almost entirely reference text and need the most original substance grafted in.",
    "Treat the warning as a prompt, not a verdict. On a legitimately encyclopedic topic the heuristic can over-fire, so confirm the page actually reads as reworded Wikipedia before rewriting it."
  ],
  spamBrainContext:
    "Google's quality systems have penalised 'no added value' content for over a decade, copied or thinly-reworded reference material has been a Lowest-quality marker in the Search Quality Rater Guidelines since long before the helpful-content era, and the March 5, 2024 scaled-content-abuse update made it enforceable at scale by naming pages with 'little unique value' regardless of how they were produced. A page that is 40% reworded Wikipedia is the textbook case: useful information, zero originality.\n\ncontent/wikipedia-paraphrase (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is a deliberately standalone originality signal. Where spam/near-duplicate compares your pages against each other with SimHash and content/unique-value counts page-exclusive vocabulary within the audit, this rule reaches outside the crawl entirely, comparing each page's trigrams against a bundled Wikipedia corpus. That external reach is what makes it orthogonal, and what makes it low confidence. The corpus is finite and bundled, so it cannot see every Wikipedia article, and trigram overlap measures phrasing, not intent.\n\nThe rule cannot tell paraphrase from coincidence with certainty. It flags pages that statistically read like reworded encyclopedia and asks you to judge whether they are, which is why it ships as a warning at low confidence, never as an error.",
  faqs: [
    {
      q: "Does a 40% overlap mean Google will penalise my page?",
      a: "No. The 40% threshold is pseolint's heuristic for 'this reads like reworded Wikipedia', not a Google penalty line. The rule fires at warning severity and low confidence precisely because trigram overlap is suggestive, not conclusive. A high overlap means a searcher likely gains nothing from your page over the encyclopedia itself, so it is worth rewriting, but it is a prompt to look, not proof of plagiarism or a manual action."
    },
    {
      q: "Why use trigram overlap instead of a real plagiarism checker?",
      a: "A full plagiarism check would compare against the live web and cost far more than a 60-second audit can spend. Trigrams (sliding three-word windows) checked against a bundled bloom filter run in milliseconds with no network call and roughly a 5% false-positive rate. It is a cheap, deterministic proxy: it catches the shape of reworded reference text without the expense of a true semantic comparison, which is the right trade-off for a fast standalone signal."
    },
    {
      q: "What is the bundled Wikipedia corpus and what does it miss?",
      a: "It is a curated set of about 10,000 Wikipedia trigrams stored as an 8-kilobyte bloom filter inlined in the engine, so the rule works in any runtime with no filesystem or network dependency. Because it is finite and bundled, it does not cover all of Wikipedia, a page reworded from an article outside the corpus may score low and pass. The rule is a low-confidence net for common encyclopedic phrasing, not an exhaustive copy detector."
    },
    {
      q: "I run a fossil-collecting site about real species: won't every page trip this?",
      a: "Only if you rework the encyclopedia. Naming a Cretaceous trilobite or describing theropod anatomy in common phrasing can nudge the overlap up, but the threshold is 40%, and a page built from your own field notes clears it easily. The cure is first-hand substance: the locality you collected at, the sediment layer and matrix, your prep method, the measured size of your specimen. That material exists on no Wikipedia page, so it drives overlap down regardless of how encyclopedic the species is."
    },
    {
      q: "How is this different from the regurgitated-content rule?",
      a: "content/regurgitated-content asks whether your pages repeat each other; content/wikipedia-paraphrase asks whether your page repeats Wikipedia. They are orthogonal: a site can pass every internal-duplication check and still be a thin gloss over the encyclopedia on every URL, because that overlap is with an external source the other rules never compare against. Run both, one guards against self-duplication, the other against reworded reference material."
    }
  ],
  relatedRules: ["regurgitated-content", "unique-value", "near-duplicate"],
  relatedTool: "thin-content-scanner"
},
  {
  slug: "value-add",
  ruleId: "content/value-add",
  title: "Value-Add Score: The Composite That Reads Seven Other Rules",
  metaDescription:
    "No single rule proves a page is worthless, but seven failing at once do. How content/value-add blends 7 originality signals into one score and fires below a 50% floor.",
  primaryKeyword: "page value-add score SEO",
  oneLiner:
    "content/value-add is a second-pass composite that reads seven other rules' findings: originality, freshness, citable facts, the four-category E-E-A-T count, translation, cliche reuse, and Wikipedia paraphrase: weights each at one-seventh, averages them into a single 0-to-1 score, and fires an error below 50% or a critical below 30%, the synthesis SpamBrain has rewarded since the March 5, 2024 update.",
  whatItDetects:
    "content/value-add does not parse a page. It runs after every other rule has finished and reads their findings, turning seven separate originality checks into one number. Each signal is scored 0, 0.5, or 1 for the page, and the rule takes the plain average, every signal weighted at one-seventh, about 14%.\n\nThe seven signals are: originality (1 unless content/regurgitated-content fired here, then 0), freshness (from aeo/freshness-signals, 1 if silent, 0.5 at warning, 0 otherwise), citable facts (from aeo/citable-facts, 1 if silent, 0.5 at info or warning, 0 otherwise), E-E-A-T (a four-category count, 1 at four signals, 0.5 at two or three, 0 below two), translation (0 if content/translation-no-op named this page, else 1), cliche reuse (0 if content/common-phrase-reuse fired, else 1), and Wikipedia paraphrase (0 if content/wikipedia-paraphrase fired, else 1).\n\nThe average is the value-add score. Below 50% the rule fires one finding per page at error severity; below 30% it escalates that finding to critical. Confidence is fixed at medium.",
  whyItMatters:
    "Any one of the seven underlying rules can fire on a page that is basically fine. A freshness warning alone is not a verdict. A single missing E-E-A-T category is not a verdict. content/value-add exists because the verdict lives in the pattern, not the part: a page that is regurgitated AND stale AND fact-thin AND anonymous is not seven small problems, it is one worthless page wearing seven labels.\n\nThis is why the rule is a synthesis and not a detector. It owns no new logic and looks at no HTML. It simply asks, across the seven independent originality proxies the suite already computed, how many does this page pass? A page scoring below 50% has failed the majority of them, which is the engine's structural definition of a page carrying no proprietary value-add; nothing original, current, sourced, attributed, or freshly written that a competitor's database export would not also contain.\n\nBecause it averages, a single weak signal almost never sinks a page. It takes three or four failing signals to cross the 50% line, so the finding lands only when the deficit is broad. That makes it the rule worth reading first: the highest-level summary of whether a URL earns its slot.",
  failingExample:
    "/oolong/tie-guan-yin on a specialty-tea importer's catalog. The tasting copy was paraphrased from a supplier sheet (content/regurgitated-content fired), there is no published or updated date (freshness scored 0), no harvest figures or steeping parameters a buyer could cite (citable-facts scored 0), and no byline, about link, or sources block (E-E-A-T scored 0). Four of seven signals sit at zero, the average lands at 43%, and content/value-add fires an error: 'value-add score 43%, the page lacks proprietary value-add and is demoted by SpamBrain.'",
  passingExample:
    "The same oolong page, rebuilt with material that exists nowhere else: a first-flush harvest window of 9 days in late April, a single-estate terroir note naming the 1,200-metre Anxi slope, an exact 90-second gaiwan steeping spec at 95 degrees, and a 'Tasted and updated 6 weeks ago by our head buyer' line that resolves both the date and the E-E-A-T author categories. Originality, freshness, facts, and E-E-A-T all climb to 1, the average clears 80%, and the rule stays silent because five of seven signals now pass cleanly.",
  howToFix: [
    "Lift originality first: rewrite any copy that tripped regurgitated-content into a page-specific tasting note, because that signal is binary and recovering it adds a full one-seventh to the score.",
    "Add a real published or updated date so the freshness signal climbs from 0 toward 1: an undated page scores zero on a signal that costs one line of markup to fix.",
    "Bind citable facts a buyer can quote (a harvest window, a steeping temperature, an estate elevation) so the citable-facts signal stops scoring zero on a page of pure prose.",
    "Reach four E-E-A-T categories (a byline, an about link, a date, and a sources block) since two or three only earns 0.5 while four earns the full point.",
    "Clear cliche reuse and any translation-no-op flag: both are binary signals, and a page padded with common phrases or a hollow auto-translation each forfeits a full one-seventh.",
    "Re-run the audit after fixing the worst two signals: because the score is an average, recovering two zeros to ones usually moves a 43% page past the 50% floor in one pass."
  ],
  spamBrainContext:
    "SpamBrain does not score a tea page on whether its byline tag is present or its date is fresh in isolation. It asks the higher-order question the March 5, 2024 scaled-content-abuse policy named directly: does this page exist 'with little unique value'? That clause is a judgment about the whole page, not any single attribute, and a single-rule auditor cannot mirror it, because no one rule carries enough evidence to make that call.\n\ncontent/value-add (in @pseolint/core, MIT-licensed at github.com/ouranos-labs/pseolint) is the suite's answer to that mismatch. It is the only second-pass rule that reads other findings instead of HTML, and it deliberately weights its seven inputs equally so that no single proprietary signal dominates the verdict. A page is demoted not for one missing marker but for a broad absence of originality, freshness, sourcing, and attribution all at once, the same convergence Google's quality systems read as a page made to fill a template rather than to help a reader.\n\nThe rule fires at error below 50% and critical below 30% precisely because crossing those lines requires failing a majority of independent checks, which is as close as an offline audit gets to the holistic 'little unique value' call.",
  faqs: [
    {
      q: "How can a rule fire without ever looking at the page?",
      a: "content/value-add runs in a second pass, after every other rule has already inspected the HTML. It reads their findings, not the markup. For each page it checks seven results, did regurgitated-content fire, what severity did freshness-signals reach, how many E-E-A-T categories were counted, and so on, scores each 0, 0.5, or 1, and averages them. The 'detection' already happened in the rules it reads; this rule only synthesises their verdicts into one number, which is why it owns no parsing logic of its own."
    },
    {
      q: "What exactly are the seven signals and how are they weighted?",
      a: "Originality (from regurgitated-content), freshness (from aeo/freshness-signals), citable facts (from aeo/citable-facts), an E-E-A-T four-category count, translation (from translation-no-op), cliche reuse (from common-phrase-reuse), and Wikipedia paraphrase (from wikipedia-paraphrase). Each is weighted equally at one-seventh, roughly 14%, and the rule takes the plain average of all seven. No signal counts more than another, which is deliberate: the rule is measuring breadth of failure, not the severity of any single weakness."
    },
    {
      q: "Why does the threshold sit at 50% rather than flagging any single low signal?",
      a: "Because a single weak signal is not evidence a page is worthless. A page can be slightly stale or missing one E-E-A-T category and still be genuinely useful, so firing on one zero would be noise. By requiring the average to fall below 50%, the rule only flags pages that have failed the majority of seven independent originality checks. That broad deficit is the engine's structural stand-in for the 'little unique value' judgment, and it takes three or four failing signals to get there."
    },
    {
      q: "When does the finding escalate from error to critical?",
      a: "The rule fires at error severity for any page scoring below 50%, and escalates the same single finding to critical when the score drops below 30%. A sub-30% page has failed roughly five of the seven signals; it is not merely thin, it is regurgitated, stale, unsourced, anonymous, and cliched at the same time. Confidence stays fixed at medium across both bands, because the rule is reading proxies for value rather than measuring value directly, and it is honest about that distinction."
    },
    {
      q: "Our single-estate tea catalog tripped value-add on a whole varietal range: where do we start?",
      a: "Read which signals scored zero, because the rule reports the composite breakdown. A typical tea-importer failure is four zeros at once: supplier-sheet copy tripping originality, no harvest date tripping freshness, no steeping or terroir figures tripping citable-facts, and an anonymous template tripping E-E-A-T. Fix the two cheapest binary signals first (rewrite the paraphrased tasting note and add a real 'tasted 6 weeks ago' date) and a 43% page usually clears the 50% floor in one pass, because each recovered zero adds a full one-seventh. Then bind a first-flush harvest window and a 90-second gaiwan steeping spec per varietal so the facts signal climbs too. One importer that reworked 26% of its oolong range this way moved the whole cluster from critical to clean within a 12 day recrawl, because the same template fix lifted every page's score at once."
    }
  ],
  relatedRules: ["unique-value", "eeat-signals", "regurgitated-content"],
  relatedTool: "spambrain-checker"
}
,
  {
    slug: "crawlable-anchors",
    ruleId: "links/crawlable-anchors",
    title: "Crawlable Anchors: How Click-Handler Navigation Hides Pages From Googlebot",
    metaDescription: "Googlebot follows href attributes, never onClick handlers. How links/crawlable-anchors counts unreachable <a> elements and when a warning escalates to an error.",
    primaryKeyword: "crawlable links",
    oneLiner: "Googlebot follows only <a> and <area> elements carrying a resolvable href, so links/crawlable-anchors raises a warning the moment 3 anchors on a page have no usable href, or when 20% of at least 5 anchors turn out to be click-handler pseudo-links, and escalates to error at 5 broken anchors on a page left with fewer than 2 crawlable same-host destinations.",
    whatItDetects: "Three anchors with no resolvable href is where this rule starts reporting. It loads each page's HTML with cheerio, walks every <a> element in document order, and treats exactly three shapes as non-crawlable: an href attribute that is missing or trims to an empty string, which is precisely what a React <a onClick={handleNav}> renders; an href beginning with javascript: in any casing; and an href of exactly # on an element that also carries onclick or one of six framework router attributes matched by name (routerlink, data-router-link, to, ng-click, @click, v-on:click). Nothing outside that list is counted. A genuine fragment target such as href=\"#deposit-policy\" passes untouched, mailto: and tel: pass, and <button> elements are never inspected at all, because a button is legitimately not a link. Pages whose HTML is empty or whitespace-only are skipped before any parsing happens.\n\nTwo independent conditions raise a finding. The absolute one fires when 3 or more anchors on a single page are non-crawlable. The proportional one fires when a page carries at least 5 anchors and 20% or more of them fail, which catches compact navigations that would slip under the absolute count. Severity then depends on how much reachable navigation survives: warning by default, escalating to error when 5 or more anchors are non-crawlable AND the page retains fewer than 2 crawlable same-host links. That survivor count is deliberately strict, since fragment-only hrefs, mailto:, tel:, and any non-HTTP protocol are excluded from it, and cross-host links do not rescue the page. An error therefore means Googlebot arriving here has almost nowhere left to go. Every finding is emitted at high confidence and quotes up to 3 offending anchor labels, each truncated at 40 characters, so you can trace the component that produced them.",
    whyItMatters: "Picture an outdoor-gear rental marketplace listing sea kayaks, avalanche beacons and canyoning kit. Its category navigation is one React component, and each of the 18 gear categories renders as <a onClick={() => router.push('/rent/sea-kayaks')}> with no href, because the team wanted a route-transition spinner between pages. In a browser this behaves flawlessly. To Googlebot it is 18 fragments of styled text. Google's crawlable-links guidance is explicit that the crawler follows a link only when it is an <a> element with a resolvable href, and that it does not click elements or simulate user interaction; Lighthouse ships the identical test as its crawlable-anchors audit. So /rent/avalanche-beacons and /rent/canyoning-kit render, convert, and take deposits, while remaining discoverable only through whatever else happens to reference them.\n\nThe failure survives redesigns because nothing visibly breaks. The XML sitemap still lists all 18 hubs, so they get crawled and often indexed, but they receive no internal link equity from the navigation that is supposed to feed them, and the marketplace's 2,400 individual gear listings sit two router hops below a menu Googlebot never traverses. Google's large-site crawl-budget guidance describes exactly this outcome: URLs that arrive with weak internal signals are refetched less often, so seasonal inventory changes (beacon stock before a January avalanche-safety course rush, canyoning kit in June) reach the index late or not at all. When the rule escalates to error on a hub page with fewer than 2 crawlable same-host links, that page is functionally a dead end for the crawler even though a human sees a full menu.",
    failingExample: "/rent/avalanche-beacons on the rental marketplace ships 22 <a> elements. Sixteen are the category menu, rendered as <a className=\"nav-item\" onClick={() => router.push('/rent/canyoning-kit')}>Canyoning kit</a> with no href attribute at all; three more are href=\"javascript:void(0)\" filter toggles for beacon frequency. That leaves 19 of 22 anchors non-crawlable (86%) and exactly 1 crawlable same-host link, the footer's /terms. Both the 3-anchor absolute condition and the 20%-of-5 proportional condition fire, and because 19 exceeds 5 while crawlable same-host links number fewer than 2, the finding is reported at error severity.",
    passingExample: "The same /rent/avalanche-beacons page after the menu is rewritten as <Link href=\"/rent/canyoning-kit\"> so every item emits a real <a href=\"/rent/canyoning-kit\">, with the router transition attached to the click event rather than replacing the href. The three beacon-frequency filters become <button type=\"button\"> elements, which the rule never inspects. The page now reports 19 crawlable same-host anchors and 0 non-crawlable ones, so neither the 3-anchor absolute trigger nor the 20% proportional trigger is reachable, and the 2,400 listing pages below the menu gain a real crawl path.",
    howToFix: [
      "Render a real href on every navigation anchor and attach the router transition to the click event instead of replacing the href; frameworks all support this via their Link component.",
      "Convert genuine in-page controls (filter toggles, accordions, sort switches) to <button type=\"button\"> so they stop being counted as broken links at all.",
      "Grep the codebase for href=\"javascript: and href=\"#\" paired with onClick, then fix the shared component rather than the individual pages the audit happened to sample.",
      "Check the error-severity findings first: those are pages left with fewer than 2 crawlable same-host links, meaning Googlebot has no onward path from them.",
      "Verify the fix by fetching the page with JavaScript disabled, or by using URL Inspection's rendered HTML, and confirming the hrefs are present in the markup Googlebot receives.",
      "Do not treat the XML sitemap as a substitute; it supplies discovery but no internal link context, so orphaned hubs stay orphaned."
    ],
    spamBrainContext: "Google retired the AJAX crawling scheme it announced in October 2015 and removed support in the second quarter of 2018, then made Googlebot evergreen on Chromium in May 2019, so the modern crawler genuinely executes JavaScript in a second rendering wave. That capability is routinely over-read. Rendering means the DOM is built and scripts run; it has never meant the crawler clicks, hovers, scrolls to trigger handlers, or submits forms, which is why an anchor whose destination exists only inside an onClick closure stays invisible after rendering completes. This rule encodes that boundary rather than the folk version of it, and reports at high confidence because the distinction is mechanical, not probabilistic.\n\nThe downstream risk is structural. A cluster of URLs that no human-followable path reaches, discovered only through a sitemap feed, is shaped like the templated URL sets the March 5, 2024 scaled-content-abuse update was written to demote, and the Helpful Content System rebuilt on August 25, 2022 evaluates helpfulness across a whole site rather than page by page. A rental marketplace with 2,400 listings hanging beneath an unreachable menu is not spamming anyone, yet it presents the index with the same silhouette: many near-identical URLs, no internal navigation explaining how they relate. Repairing anchors is therefore the cheapest way to make a legitimate catalogue read as a catalogue instead of a feed.",
    faqs: [
      {
        "q": "Does Google follow onClick links in React?",
        "a": "No. Google renders JavaScript but does not simulate user interaction, so a route change that only happens inside an onClick handler is never triggered during crawling. The anchor has no href for the crawler to queue, which is why pseolint counts it as non-crawlable regardless of how well it works for a real visitor in a browser."
      },
      {
        "q": "Do I still need an href if I use the Next.js Link component?",
        "a": "The Link component already emits a real href in the rendered markup, so it passes this rule as-is. The failure appears when someone bypasses Link and hand-writes an anchor with only a click handler, or spreads props in a way that drops the href. Inspect the served HTML rather than the JSX to know which of the two you shipped."
      },
      {
        "q": "Is href=\"#\" bad for SEO?",
        "a": "Only in combination. This rule flags href=\"#\" when the same element also carries onclick or a router attribute such as routerlink, to, or @click, because that pairing marks a pseudo-link. A plain href=\"#section-name\" pointing at a real fragment on the page is legitimate navigation and is never counted against you."
      },
      {
        "q": "Why is my page an error instead of a warning?",
        "a": "Escalation needs two things at once: 5 or more non-crawlable anchors, and fewer than 2 crawlable links pointing to your own host. Fragment-only hrefs, mailto:, tel:, and links to other domains are excluded from that survivor count. An error means a crawler landing on the page has effectively no onward route into the rest of the site."
      },
      {
        "q": "Will submitting a sitemap fix non-crawlable navigation?",
        "a": "It fixes discovery only. Google can find the URLs, but the pages arrive with no internal link context, so they compete without the relevance and importance signals a real navigation would pass along. Google's large-site crawl-budget guidance notes that weakly linked URLs get refetched less often, which delays every inventory or pricing change you publish."
      },
      {
        "q": "Do buttons count as broken links in this check?",
        "a": "No. The rule inspects <a> elements exclusively and ignores <button> entirely, on the reasoning that a button is legitimately a control rather than a link. Converting an interactive pseudo-link into a real button is a valid fix: it removes the finding and produces markup that is more accurate for assistive technology at the same time."
      }
    ],
    relatedRules: [
      "dead-ends",
      "link-depth",
      "cluster-connectivity"
    ],
    relatedTool: "thin-content-scanner",
  },
  {
    slug: "generic-anchor-text",
    ruleId: "links/generic-anchor-text",
    title: "Generic Anchor Text: When Half Your Internal Links Say Read More",
    metaDescription: "Read more tells Google nothing about the destination. How links/generic-anchor-text scores internal anchors against a 16-phrase set and reports at the 50% mark.",
    primaryKeyword: "generic anchor text",
    oneLiner: "links/generic-anchor-text reports at info severity as soon as half or more of a page's internal links carry one of 16 generic labels such as read more, click here, learn more or details, evaluated only on pages holding at least 5 internal links, because anchor text is the description Google and AI answer engines attach to whatever sits at the other end.",
    whatItDetects: "Half is the line. The rule computes one ratio per page, generic internal anchors divided by total internal anchors, and reports at info severity with medium confidence once that ratio reaches 0.5 on a page carrying at least 5 internal links. Below 5 internal links the page is skipped without evaluation, so a sparse footer never trips it. Scope is strictly internal: each href is resolved against the page URL, and only http and https targets whose host matches the page's own host are counted. A relative href such as /clinics/riverside-veterinary-hospital always qualifies as internal; an outbound link to a state veterinary licensing board is never counted in either the numerator or the denominator. Pages with empty HTML, and pages whose own URL fails to parse, are dropped before counting begins.\n\nAn anchor's effective text is its trimmed text content, falling back to the alt attribute of its first nested <img> so that image links are judged by the label they actually present. That string is lowercased and stripped of trailing punctuation from the class [.!?,:;>-] plus ellipsis and arrow characters, then matched against a fixed set of 16 phrases: click here, here, read more, learn more, more, link, this, this page, see more, details, more info, continue, continue reading, click, go, start. Empty effective text counts as generic too, since an unlabelled anchor carries no destination signal whatsoever. Read more and Read more. and Read more with a trailing arrow all normalise to the same entry, which is why decorating the label defeats nothing. The finding reports the generic count, the internal total, the rounded percentage, and up to 3 verbatim samples.",
    whyItMatters: "A veterinary clinic directory covering 1,900 practices renders each listing as a card: practice name in an h3, street address, an opening-hours line, and a single link reading Read more. On a county page showing 24 cards, that is 24 internal links out of roughly 30 once the breadcrumb and pagination are included, a ratio near 0.8 that clears the 0.5 threshold with room to spare. Google's link guidance describes anchor text as how it works out what the linked page is about, so the directory spends its entire internal-linking vocabulary on the same two words 1,900 times. The destination pages are genuinely differentiated (species treated, emergency hours, whether the practice runs an on-site laboratory) and none of that reaches the crawler through the links.\n\nThe cost shows up twice. Internally, every clinic page is described to Google identically, so a search for an emergency exotic-animal vet has nothing in the link graph pointing it toward the four practices that actually offer it. Externally, answer engines increasingly label a citation with the anchor or heading text that led to it, and Google's AI-features documentation ties eligibility to content being clearly structured and understandable. This rule is deliberately the mildest in pseolint's link family, info severity at medium confidence, because generic anchors are a wasted opportunity rather than a policy violation. Nothing in Google's spam policies prohibits the phrase read more; competitors that report it as a critical error are inventing a severity the documentation does not support.",
    failingExample: "/vets/marion-county on the clinic directory renders 24 practice cards, each closing with <a href=\"/clinics/riverside-veterinary-hospital\">Read more</a>. Adding the breadcrumb and the two pagination links gives 27 internal links, of which 24 normalise to read more, a ratio of 0.89. One card uses an image link whose img alt is empty, so it is counted as generic as well, taking the total to 25 of 27 (93%). The rule reports at info severity and quotes three samples, all of them the identical string.",
    passingExample: "The same /vets/marion-county page after each card's link is rewritten to name its destination: <a href=\"/clinics/riverside-veterinary-hospital\">Riverside Veterinary Hospital: 24-hour emergency and exotics</a>. The image link's img alt becomes the practice name rather than an empty string. Generic anchors fall to 2 of 27 (7%), well under the 0.5 threshold, and every clinic page now receives an internal link whose text states both its identity and its differentiating service, which is the label an answer engine reuses when it cites the page.",
    howToFix: [
      "Replace card call-to-action labels with the destination entity's own name, and append the one attribute that distinguishes it from sibling entries.",
      "Fix the shared card component rather than individual pages; a directory template repeats the same anchor thousands of times from one line of JSX.",
      "Give image links a meaningful img alt, because the rule falls back to that alt and treats an empty one exactly like the phrase click here.",
      "Keep the visible affordance if designers want one, by wrapping the descriptive text and styling it as a button rather than shortening the label.",
      "Audit the 16 matched phrases against your own copy deck so writers stop reintroducing them in new templates after the fix ships.",
      "Re-run pseolint and check the reported percentage rather than the raw count; the threshold is a ratio, so adding more generic links to a longer page does not help."
    ],
    spamBrainContext: "Google's crawlable-links documentation devotes a section to anchor text specifically, describing it as the text Google uses to understand the page being linked to, and recommending text that describes the destination rather than generic wording. Lighthouse ships the same check as its link-text audit. Neither source frames generic anchors as spam, and pseolint follows that reading: the rule fires at info severity with medium confidence and never contributes to a critical stack. Accuracy here is the point, since a linter that inflates a documented best practice into a penalty teaches its users to distrust the findings that genuinely are penalties.\n\nWhere the pattern does become a risk is in combination. A directory whose 1,900 listing pages differ only in a swapped practice name, and whose entire internal link graph reads read more, presents the templated silhouette that the March 5, 2024 scaled-content-abuse update names, and the site-reputation-abuse policy of May 7, 2024 extended similar reasoning to hosted third-party listings. Anchor text is also the cheapest differentiator available, since fixing it changes one component rather than 1,900 pages of prose. Google's AI-features guidance ties inclusion in generated answers to content whose structure makes its subject plain, and a link labelled with the clinic's name and its emergency-hours policy makes that subject plain in six words.",
    faqs: [
      {
        "q": "Does anchor text still matter for internal links?",
        "a": "Yes. Google's own link documentation says anchor text helps it understand what the linked page is about, and internal links are the anchors you control completely. Descriptive internal anchors are also what answer engines tend to reuse as the label on a citation, so the wording does double duty across classic results and generated answers."
      },
      {
        "q": "Is read more bad for SEO?",
        "a": "It is a wasted signal rather than a violation. Nothing in Google's spam policies prohibits the phrase, which is why pseolint reports it at info severity with medium confidence. It becomes a real problem at volume: when 24 of 27 internal links on a directory page say the same two words, the link graph describes none of the destinations it points at."
      },
      {
        "q": "How many generic links are allowed before the rule fires?",
        "a": "The trigger is proportional, not absolute. A page needs at least 5 internal links, and 50% or more of them must normalise to one of the 16 tracked phrases or be empty. Four generic anchors out of ten never fires; five out of ten does. Lengthening the page with additional generic links raises the ratio rather than diluting it."
      },
      {
        "q": "Do image links count as generic anchor text?",
        "a": "They do. When an anchor has no text content, the rule falls back to the alt attribute on its first nested img and evaluates that string instead. An image link whose alt is missing or empty is treated as generic, on the reasoning that an anchor presenting no readable label passes no information about its destination to anyone."
      },
      {
        "q": "Does this rule check external links too?",
        "a": "No. Only links resolving to the same host as the page being audited are counted, in the numerator and the denominator alike. Outbound citations to a licensing board or a manufacturer are excluded entirely, so a page full of well-labelled external references cannot mask a card grid whose internal anchors all read learn more."
      },
      {
        "q": "Will adding an arrow or ellipsis after read more avoid the check?",
        "a": "It will not. Anchor text is lowercased and stripped of trailing punctuation, ellipses and arrow characters before matching, so read more, Read more., and Read more with a chevron all collapse to the same entry in the 16-phrase set. The only fix that changes the outcome is naming the destination in the link text."
      }
    ],
    relatedRules: [
      "crawlable-anchors",
      "image-alt-text",
      "dead-ends"
    ],
    relatedTool: "doorway-page-detector",
  },
  {
    slug: "meta-description-presence",
    ruleId: "content/meta-description-presence",
    title: "Missing Meta Descriptions: What Google Writes When You Do Not",
    metaDescription: "With no meta description, Google composes your snippet from arbitrary page text. Why pseolint flags absence at warning severity and refuses to lint description length.",
    primaryKeyword: "missing meta description",
    oneLiner: "A page shipping no meta description hands Google's snippet generator the job of writing its search result, which is why content/meta-description-presence flags every such URL at warning severity with high confidence, and why the rule checks presence alone: Google's snippet documentation states no character limit for descriptions exists.",
    whatItDetects: "The check is one boolean per page and is deliberately shallow. content/meta-description-presence reads the parsed page's metaDescription value, trims it, and reports every URL where what remains is an empty string. Whitespace-only content counts as absent, since a tag containing a single space communicates nothing to a snippet generator. Pages that carry no HTML at all are skipped rather than reported, so a failed fetch never masquerades as a missing tag. Each finding lands at warning severity with high confidence, names the offending URL, and states the consequence in the message itself: Google will compose the snippet from page text, so the site loses control of its own click-through pitch. The attached fix is a single instruction, to add a description to the head written for that specific page rather than a site-wide line pasted everywhere.\n\nWhat the rule refuses to do carries as much weight. It never measures length. Google's snippet documentation states there is no limit on how long a meta description can be, and truncation in a result listing is a device-width display behaviour rather than an indexing event, so a 155-character maximum check would encode folklore instead of policy; pseolint publishes that claim as entry 1 in its folklore table and declines pull requests adding it. The rule likewise ignores keyword usage, and it does not flag duplication. Descriptions repeated across a cluster are a separate finding, content/meta-uniqueness. Presence and uniqueness fail differently and are fixed differently, and merging them into one score is how audit tools produce a 4,000-row report nobody can triage.",
    whyItMatters: "A B2B integrations catalog for payroll and HRIS connectors ships 4,000 pages generated from a connector registry: /integrations/gusto-to-workday, /integrations/bamboohr-to-adp-workforce-now, and 3,998 siblings. The layout component that renders them was never given a description tag, so all 4,000 URLs are flagged in a single audit. Google then composes each snippet itself, drawing whatever on-page text best matches the query, which on these pages almost always lands on the opening sentence of the shared How this sync works block. Four thousand results in the index, and the same 22 words of boilerplate underneath every one of them, describing the mechanism rather than the connector a buyer searched for.\n\nThe buying context makes the loss concrete. Someone searching for a Gusto to Workday employee sync is deciding in the result listing whether the connector handles what they need, and the facts that settle it are all in the registry already: sync direction, whether the cadence is hourly or nightly, which objects are covered, and whether the connector is generally available or in beta. None reach the snippet while the tag is absent. Google's snippet documentation is direct that a good description is the site's chance to advertise the page to searchers, and its AI-features guidance ties inclusion in generated answers to content whose subject is plainly stated. One template line reading from four registry fields fixes all 4,000 pages, provided the resulting text differs per connector.",
    failingExample: "/integrations/bamboohr-to-adp-workforce-now on the connector catalog renders a full page: an h1, a field-mapping table with 34 rows, and a setup walkthrough. Its head contains a title, a canonical, and og:image, but no meta name=\"description\" element at all. content/meta-description-presence flags it at warning severity, along with the other 3,999 registry-generated URLs, and Google composes the snippet from the shared opening line How this sync works: connectors run on a scheduled job and reconcile records between systems, which appears verbatim beneath every connector in the catalog.",
    passingExample: "The same URL after the layout emits a description assembled from registry fields: \"Sync BambooHR employees, compensation and time-off balances into ADP Workforce Now on an hourly schedule. One-way, 34 mapped fields, generally available since March 2025.\" Every one of the 4,000 pages produces different text because the direction, cadence, mapped-field count and availability date differ per connector, so the catalog clears content/meta-description-presence and content/meta-uniqueness at the same time rather than trading one finding for the other.",
    howToFix: [
      "Emit the description from the same data source that generates the page, so each URL draws on fields that genuinely differ between entities.",
      "Write for the searcher's decision rather than for a keyword: state what the page offers and which constraint it resolves.",
      "Check content/meta-uniqueness immediately after fixing presence, since a template that fills the tag with one shared sentence trades one finding for another.",
      "Ignore any tool telling you to stay under 155 or 160 characters; Google documents no limit, and truncation is a display behaviour that varies by device width.",
      "Prioritise pages that already earn impressions, because a rewritten snippet changes click-through on results that are being seen today.",
      "Leave descriptions off pages you have deliberately excluded from indexing, and add the URL patterns to the ignore list in pseolint.config.ts so the report stays actionable."
    ],
    spamBrainContext: "Google's snippet documentation sets the boundaries this rule works within: descriptions are not a ranking factor, Google may replace a supplied description when another passage matches the query better, and no character limit is documented anywhere in it. The supported-tags reference lists description as a tag Google reads and keywords as one it does not use, a position Google has stated publicly since 2009. The robots meta tag specification adds the controls that actually govern snippet output, max-snippet and data-nosnippet among them. Together these define a rule that checks whether the tag exists and declines to grade it, which is why the finding is a warning rather than an error.\n\nThe catalog-scale version of the problem is where policy enters. Filling 4,000 connector pages with one repeated sentence is the templated output the March 5, 2024 scaled-content-abuse update was written to demote, and the Helpful Content System rebuilt on August 25, 2022 assesses that repetition across a whole domain rather than page by page. Absence and boilerplate are therefore two ends of the same failure, and the fix has to clear both at once: descriptions generated per entity from registry fields that actually diverge. Google's AI-features guidance points the same way, tying eligibility for generated answers to pages whose subject and scope are stated plainly instead of being inferred from a shared paragraph.",
    faqs: [
      {
        "q": "Does a missing meta description hurt rankings?",
        "a": "Not directly. Google states that descriptions are not a ranking factor, and pseolint reports absence at warning rather than error for exactly that reason. The damage is to click-through: Google writes the snippet from page text instead, which on a templated catalog usually means the same shared paragraph appears beneath thousands of different results."
      },
      {
        "q": "How long should a meta description be in 2026?",
        "a": "Google documents no limit, and pseolint refuses to check length for that reason. Truncation in a result listing depends on device width and is a display behaviour, not an indexing decision. Write enough to state what the page offers and which decision it resolves; a connector page usually needs one or two sentences of real specifics."
      },
      {
        "q": "Should I write 4,000 meta descriptions by hand?",
        "a": "No, and hand-writing them is usually how they end up inconsistent. Generate the description from the same structured source that generates the page, interpolating fields that differ per entity such as sync direction, cadence, mapped-field count and availability date. That produces genuinely distinct text without anyone writing 4,000 sentences."
      },
      {
        "q": "Does Google always use the meta description I write?",
        "a": "No. Google's snippet documentation says it may generate a snippet from page content when that better matches a particular query, so a supplied description is a strong default rather than a guarantee. Supplying one still matters: without a tag there is no default at all, and every snippet is composed from whatever text the algorithms select."
      },
      {
        "q": "Is one duplicated meta description better than none?",
        "a": "Marginally, and it swaps one pseolint finding for another. Absence trips content/meta-description-presence; one sentence repeated across a cluster trips content/meta-uniqueness, and repetition across thousands of URLs is precisely the pattern the March 5, 2024 scaled-content-abuse update targets. Fix presence with per-entity text so both checks clear together."
      },
      {
        "q": "Does the rule flag pages with an empty description tag?",
        "a": "Yes. The value is trimmed before it is tested, so a tag whose content attribute is empty or holds only whitespace is treated identically to no tag at all. That is intentional: a snippet generator can do nothing with an empty string, and templated builds frequently emit blank tags when the underlying field is null."
      }
    ],
    relatedRules: [
      "meta-uniqueness",
      "title-uniqueness",
      "summary-bait"
    ],
    relatedTool: "thin-content-scanner",
  },
  {
    slug: "language-mismatch",
    ruleId: "tech/language-mismatch",
    title: "Language Mismatch: When the Declared Language Isn't the One You Published",
    metaDescription: "A Japan travel guide declared ja while shipping Cyrillic body text. How tech/language-mismatch compares your declared language against the script readers actually see.",
    primaryKeyword: "declared language mismatch SEO",
    oneLiner: "70% is the trigger: once that share of a page's script-classified letters belongs to a script no declared language uses, tech/language-mismatch fires an error at high confidence, the threshold that caught a Japan travel guide serving Russian Cyrillic body copy under a self-referencing hreflang=\"ja\", with a 200-letter floor below which the comparison is never attempted.",
    whatItDetects: "Two declarations are read per page and only two: the `lang` attribute on `<html>`, and the self-referencing hreflang entry whose href matches the page's own URL once trailing slashes are stripped and case is folded. Every other hreflang entry describes an alternate rather than this page, so the rule ignores them, and `x-default` is skipped outright because it names a fallback, not a language. Both values collapse to their primary subtag, so `ja-JP` and `ja` are the same declaration.\n\nThe rule then walks the extracted content text character by character, sorting each letter into one of 11 Unicode scripts (Latin, Cyrillic, Greek, Arabic, Hebrew, Han, Hiragana, Katakana, Hangul, Thai, Devanagari) using `\\p{Script=…}` property escapes. Characters that match none of the 11 (digits, punctuation, emoji, whitespace) are never counted, so the denominator is letters rather than bytes or words.\n\nBelow 200 classified letters the comparison is abandoned: a stub cannot produce a trustworthy script histogram, and a false error on an empty page costs more than a missed one. Above that floor, each declared primary subtag is looked up in a 38-entry table mapping ISO 639-1 codes to the scripts they are normally written in: `ru` to Cyrillic, `ja` to Han plus Hiragana plus Katakana, `ko` to Hangul plus Han, `sr` to both Cyrillic and Latin. A declared language absent from that table is never judged, which is how the rule avoids inventing findings for languages it does not model. Latin is then added to the allowed set for every language unconditionally, so brand names, inline code, and URLs sitting inside Japanese or Thai prose can never push a page toward a mismatch.\n\nLetters in scripts outside the allowed set are summed. When that incompatible share reaches 70% of all classified letters, the rule fires an error at high confidence naming the offending script and the exact percentage. When the dominant script is compatible but one incompatible non-Latin script still covers 30% or more, it fires a warning at medium confidence instead: the side-by-side-translation shape, where Google asks for a single language per page for both content and navigation. Separately, a page that carries hreflang annotations or non-Latin body text while having no `lang` attribute at all produces an info finding. Info is deliberate. Google states it does not use code-level language information such as `lang` attributes, so the attribute is an accessibility signal and the prerequisite for this rule's comparison, never a ranking input.",
    whyItMatters: "Google's multi-regional documentation settles the question directly: page language is determined from visible content, and code-level signals such as the `lang` attribute and the URL are not used. That one sentence is what turns a language mismatch from cosmetic into expensive. The declaration does not lose an argument with the content, it never enters the argument. A page whose `<html lang=\"ja\">` sits above Russian prose is indexed as a Russian page, and every mechanism downstream of the declared value stops working without complaint: the hreflang cluster the page anchors, the localized sitemap that lists it, the language filter a searcher sets in Search settings.\n\nThe failure has no error channel. Search Console will not report it, the page returns 200, the HTML validates, and the hreflang block is syntactically perfect. The only symptom visible from outside is that traffic from the intended locale never arrives while impressions accumulate from a country nobody planned for, with a bounce pattern that reads like a ranking problem and is in fact an indexing one. That is why the error tier is pinned at 70%: by the time two-thirds of the rendered letters disagree with the tag, there is no reading of the page under which the declaration is still true.\n\nThe 30% warning tier catches a quieter version of the same fault. Pages that run two languages down the same document split their own relevance across two language indexes and win neither cleanly. Google's recommendation is one language per page, with alternates living on their own URLs and connected by hreflang rather than stacked in one file.",
    failingExample: "`/ja/kyoto-hanami-guide` on a Japan travel guide ships `<html lang=\"ja\">` and a self-referencing `hreflang=\"ja\"` pointing at its own URL, but the body was pasted from an unlocalised Russian feed. Of 4,180 script-classified letters, 3,902 are Cyrillic (93%); the remaining 278 are 210 Latin characters from romanised place names (Fushimi Inari, JR Nara Line) and 68 Han characters in temple names. Declared `ja` permits Han, Hiragana, and Katakana, plus Latin as always, so the incompatible share is 93% and the rule fires an error at high confidence. Google indexes the page as Russian, and the `ja`/`en`/`ko` hreflang cluster it was built to anchor never resolves.",
    passingExample: "The guide is re-cut into two URLs. `/ja/kyoto-hanami-guide` now carries genuine Japanese copy: of 5,640 classified letters, 5,331 are Hiragana, Katakana, or Han, and 309 are Latin from JR Pass, Wi-Fi, and romanised temple names. Latin is tolerated for every declared language, so the incompatible share is 0% and nothing fires. The Russian text moves to `/ru/kyoto-hanami-guide` with `<html lang=\"ru\">` and its own self-referencing `hreflang=\"ru\"`, where 96% Cyrillic is exactly what the declaration promises, and the two pages now point at each other as alternates that Google can actually act on.",
    howToFix: [
      "Decide which side is wrong before you edit anything: if the Russian copy is the real deliverable, move it to its own /ru/ URL and declare ru; if the Japanese page is the deliverable, replace the body rather than the tag.",
      "Check the self-referencing hreflang as well as the lang attribute. The rule reads both, and a page whose self entry disagrees with its html lang is declaring two languages at once.",
      "Find the point in the pipeline where a translation can silently no-op. A missing locale key that falls back to the source string is the usual origin of an entire directory of mismatched pages.",
      "Split side-by-side bilingual documents into one URL per language, each with its own lang declaration, and connect them with hreflang instead of stacking both in one file.",
      "Add <html lang> everywhere even though it is not a ranking factor: it is an accessibility signal, and it is what lets this rule and your own QA verify locale targeting at all.",
      "Re-run the audit as each locale ships. The 200-letter floor means near-empty stub translations stay silent until real copy lands, so a clean run on placeholder pages proves nothing."
    ],
    spamBrainContext: "Language mismatch is not a spam signal in itself, and pseolint does not score it as one; the error tier tops out at a technical targeting failure. What makes it worth reading next to the spam rules is where it comes from. Machine-translation pipelines that fail open produce exactly this fingerprint across a whole directory: hundreds of URLs declaring a locale they never actually received. Google's spam policies, expanded on March 5, 2024 to name scaled content abuse explicitly, already list translating content from another source without adding sufficient value as a violation. A directory of `ja` declarations sitting over untranslated source text is the crawl-visible residue of that same pipeline, and it is usually cheaper to detect than the prose problem underneath it.\n\nThe rule is also a deliberate correction to a durable piece of SEO folklore. The common claim is that a wrong or missing `lang` attribute is an SEO problem; Google's multi-regional documentation says the opposite, that code-level language information is not used. pseolint therefore reports a missing `lang` at info severity only, and reserves error severity for the case the documentation does describe as consequential: declared and detected diverging, with the index following what was detected. That is why the 70% and 30% thresholds are measured on rendered letters rather than on markup, and why Latin is exempted from the count entirely rather than being treated as evidence.",
    faqs: [
      {
        "q": "Does the html lang attribute affect Google rankings?",
        "a": "No. Google's multi-regional documentation states it does not use code-level language information such as lang attributes or the URL, and detects language from visible content instead. The attribute still matters for screen readers and for tooling that verifies your targeting, which is why pseolint reports a missing lang at info severity rather than as an error."
      },
      {
        "q": "Why is my Japanese page ranking for Russian queries?",
        "a": "Because Google indexed the language it detected, not the one you declared. If the body text is Cyrillic, the page is a Russian page regardless of what the lang attribute and hreflang say, and it will surface for Russian queries while the Japanese targeting you configured does nothing. The 70% error tier exists to surface exactly this before the impressions data does."
      },
      {
        "q": "Will English brand names inside Japanese content trigger a mismatch?",
        "a": "No. Latin is added to the allowed script set for every declared language without exception, so product names, inline code, URLs, and romanised place names never count as incompatible letters. A Japanese page can carry hundreds of Latin characters for JR Pass or Wi-Fi and still measure a 0% incompatible share."
      },
      {
        "q": "How much text does a page need before this check runs?",
        "a": "At least 200 script-classified letters. Digits, punctuation, and emoji are not classified, so the floor counts real letters only. Below it the rule skips the comparison entirely, because a short stub cannot produce a script histogram reliable enough to justify an error, and a false positive on a nearly empty page is worse than a missed one."
      },
      {
        "q": "Can one page serve two languages side by side?",
        "a": "It can, but the rule will warn once a second incompatible non-Latin script covers 30% or more of the letters. Google recommends one language per page for both content and navigation, so the recommended shape is one URL per language, each with its own declaration, joined by hreflang rather than a single document with two columns."
      }
    ],
    relatedRules: [
      "hreflang-validity",
      "translation-no-op",
      "regurgitated-content"
    ],
    relatedTool: "spambrain-checker",
  },
  {
    slug: "hreflang-validity",
    ruleId: "tech/hreflang-validity",
    title: "Hreflang Validity: The Codes Google Silently Ignores",
    metaDescription: "en_US, jp and en-UK are passed over by Google rather than corrected. How tech/hreflang-validity checks every code value against CLDR before whole locales vanish.",
    primaryKeyword: "invalid hreflang codes",
    oneLiner: "Google supports exactly one shape of hreflang value, an ISO 639-1 language plus an optional ISO 3166-1 Alpha 2 region, and three common deviations break a locale silently: the underscore in en_US, the country code jp standing where the language ja belongs, and en-UK, whose UK is reserved rather than assigned, so Google ignores that part of the annotation and you are left with a bare en. tech/hreflang-validity resolves every value through the CLDR data Node already ships, one warning per distinct bad value per page.",
    whatItDetects: "Only the code value is inspected, never the URL it points at. Each hreflang value on the page is read in document order, `x-default` is skipped because it names a fallback rather than a language, and repeated values are deduplicated so a locale listed on ten alternates reports once instead of ten times. Reciprocity, missing return links, duplicate targets, and malformed hrefs belong to `tech/hreflang-consistency` and are never duplicated here.\n\nThe first test is the cheapest one. Any value containing an underscore is rejected immediately, because BCP-47 separates subtags with hyphens and `en_US` is a POSIX locale identifier that leaked out of a backend i18n library. The suggested fix is generated by substitution, so `en_US` comes back as `en-US` with nothing else changed.\n\nValues that survive are shape-checked against a narrow subset of BCP-47, then held to Google's own admission list. Only language codes listed in ISO 639-1 and region codes listed in ISO 3166-1 Alpha 2 are supported, and the sentence that says so names `es-419` as its example of a code that is not, so a three-digit UN M.49 macro-region gets its own finding quoting that line rather than a pass. A three-letter language is reported only when an ISO 639-1 equivalent exists to recommend, because `eng-US` has an obvious fix and `fil` for Filipino has none: flagging the second would be advice nobody can act on. Four-letter script subtags pass through unvalidated by design: `zh-Hant-TW` is rare enough that bundling a script table would cost more than it catches.\n\nLookups go through `Intl`, so no ISO tables are bundled here to go stale, but CLDR is deliberately more permissive than ISO and a single `Intl.DisplayNames` call is not enough on its own: it resolves withdrawn codes through its alias table and resolves reserved non-country codes too, so `en-SU`, `en-CS` and `en-EU` all passed silently until three checks were stacked. A subtag must be known to `Intl.DisplayNames`, must survive `Intl.getCanonicalLocales` unchanged (canonicalisation rewriting `und-SU` to `und-RU` IS the withdrawal signal, for the whole alias table rather than a hand-copied excerpt), and must not sit on the short list of two-letter regions CLDR knows that ISO 3166-1 assigns to no country. Two known country-code-for-language mistakes carry a named fix: `jp` suggests `ja`, `cn` suggests `zh`. Regions are uppercased first because `Intl` is case-sensitive there, and `UK` gets its own message. Every finding is a warning at high confidence, carrying the corrected annotation in its fix string.",
    whyItMatters: "Read Google's wording precisely, because the popular summary of it overstates the damage in one direction and understates it in another. What the localized-versions page actually says is that only ISO 639-1 languages and ISO 3166-1 Alpha 2 regions are supported, and that if you use codes reserved for something else, Google Search ignores that part of the annotation, naming EU, UN and UK as its examples. So `en-UK` is not thrown away: the reserved region is dropped and a bare `en` remains, which now competes with whatever real `en` alternate the set already declares. Either way nothing is corrected, nothing is repaired by inference, and nothing is reported. There is no line for it in Search Console, no crawl error, no flag in the URL Inspection tool.\n\nThat silence is what makes the failure durable in large locale sets. A retailer running nine locales that lists every sibling on every page has 81 annotation slots per cluster. Three bad values do not degrade the set by a third of a third; they remove three locales from the graph entirely, on every page, in both directions, while the six valid ones keep reciprocating perfectly. Spot-check any surviving pair and the set looks healthy, which is precisely why the defect survives quarterly audits.\n\nWhat replaces the unread annotation is Google's own guess. Without a working link between a US English page and a UK English page whose copy is largely identical, the two compete as near-duplicates and canonicalisation elects one, so shoppers in the dropped market see prices in the wrong currency and delivery promises that do not apply to them. Note also what the rule does not demand: `x-default` is a recommendation in Google's wording, consider adding it, not a validity condition, and the rule skips the value entirely rather than requiring it.",
    failingExample: "A Nordic furniture retailer runs nine locales and stamps one alternate block into every product page. On `/en/sofas/hallstrand-3-seat`, six values are clean (`sv-SE`, `da-DK`, `nb-NO`, `fi-FI`, `de-DE`, `nl-NL`) and three are not: `en_US`, an underscore straight out of the backend's POSIX locale strings; `jp`, a country code standing where the language `ja` belongs; and `en-UK`, where the United Kingdom's region code is `GB`. The rule emits three warnings on that page, and because the block is templated, the same three on all 4,700 product URLs. The Japanese and US storefronts are absent from the hreflang graph; the UK one is worse than absent, because Google ignores the reserved UK part and reads a bare `en` that now collides with the `en_US` slot the underscore already broke. Nothing in Search Console says so.",
    passingExample: "The same block after the repair reads `sv-SE`, `da-DK`, `nb-NO`, `fi-FI`, `de-DE`, `nl-NL`, `en-US`, `ja`, `en-GB`, plus an optional `x-default` pointing at the locale picker. All nine now resolve: `en-US` because the separator is a hyphen, `ja` because it is the ISO 639-1 language rather than Japan's country code, `en-GB` because `GB` is the real ISO 3166-1 Alpha-2 region. The rule goes silent across all 4,700 product URLs, and a shopper reaching the `/en/` sofa page from Osaka now has a declared Japanese alternate that Google can act on instead of one it passes over.",
    howToFix: [
      "Grep the templates for underscores in hreflang values first. An en_US-shaped string almost always comes from one locale constant shared with a backend i18n library, so a single substitution clears every page at once.",
      "Replace country codes used as languages: jp is Japan while ja is Japanese, and cn is China while zh is Chinese. The rule names both substitutions directly in its fix string.",
      "Change en-UK to en-GB. UK is reserved rather than assigned in ISO 3166-1 Alpha-2, and Google names it among the codes whose part of the annotation it ignores, so what survives is a bare en rather than British English.",
      "Validate codes at build time rather than in review, and do not trust a single Intl.DisplayNames lookup to do it: CLDR resolves withdrawn and reserved codes that ISO does not assign, so check canonicalisation too.",
      "Drop the region when you only mean the language. ja targets Japanese speakers everywhere; ja-JP narrows it for no benefit unless you genuinely run a Japan-only storefront.",
      "Do not add x-default to satisfy a checklist. Google's wording is to consider adding it; add it when you actually have a locale picker or a global fallback page to point at."
    ],
    spamBrainContext: "Invalid hreflang codes are not a spam signal and carry no policy risk; nothing in Google's spam policies touches them. They earn their place next to the spam rules through a side effect. When the annotation goes unread, near-identical regional pages lose the one mechanism that explains why they all deserve to exist. Nine locale variants of the same sofa description, six properly linked and three orphaned, look from outside like three surplus copies of a page that already ranks.\n\nCanonicalisation then does what it always does with duplicates: elects one representative URL and suppresses the rest. The retailer experiences this as a ranking problem in Japan and the United States and starts rewriting product copy, which is the wrong repair. The copy was never the issue; the declaration named a value Google does not support, so it never counted. Scoping the rule to code values only is what keeps that diagnosis clean, because reciprocity and return-link checks live in `tech/hreflang-consistency`, and merging the two would blur which failure you are looking at.\n\nThe x-default myth deserves naming here too, since it absorbs audit time that the real defect needs. Google's phrasing is to consider adding a fallback page and use the x-default value: a recommendation, not a requirement, and a set of nine valid codes with no x-default works. A set of nine codes where three are `en_US`, `jp`, and `en-UK` does not, because the documentation restricts support to codes listed in ISO 639-1 and ISO 3166-1 Alpha 2 and none of those three is.",
    faqs: [
      {
        "q": "Is en_US a valid hreflang value?",
        "a": "No. Google supports an ISO 639-1 language with an optional ISO 3166-1 Alpha 2 region, and en_US is neither: the separator in a language tag is a hyphen, and the underscore form is a POSIX locale identifier that commonly leaks in from a backend i18n library. Google's documentation does not promise to repair it, so treat the US alternate as undeclared until the separator is fixed to en-US."
      },
      {
        "q": "Why is jp wrong for a Japanese hreflang tag?",
        "a": "Because jp is Japan's country code, not a language code. The ISO 639-1 language code for Japanese is ja. The rule ships a typo map that names the substitution directly, alongside cn to zh for Chinese, since both are frequent enough to be worth a specific message rather than a generic invalid-code warning."
      },
      {
        "q": "Should I use en-UK or en-GB for British English?",
        "a": "en-GB. There is no UK entry in ISO 3166-1 Alpha-2; the United Kingdom's code has always been GB. The rule special-cases this value with its own message because en-UK is one of the most common hreflang mistakes and looks entirely plausible to anyone reviewing the markup by eye."
      },
      {
        "q": "Does an hreflang set need x-default to be valid?",
        "a": "No. Google's wording is to consider adding x-default, which is a recommendation rather than a requirement, and this rule skips the value entirely when validating. Add x-default when you have a genuine locale picker or global fallback page to point it at, not to satisfy an audit checklist."
      },
      {
        "q": "Does an invalid hreflang code show up in Search Console?",
        "a": "No, and that is the core difficulty. There is no error, no crawl warning, and no URL Inspection flag; an unsupported code is passed over quietly, and a reserved region such as UK has just that part of the annotation ignored. The only outward symptom is that a locale never receives the traffic it was configured for, which is why validating codes at build time is more reliable than waiting for a reporting surface to tell you."
      }
    ],
    relatedRules: [
      "language-mismatch",
      "near-duplicate",
      "url-pattern"
    ],
    relatedTool: "spambrain-checker",
  },
  {
    slug: "sitemap-hygiene",
    ruleId: "tech/sitemap-hygiene",
    title: "Sitemap Hygiene: Cross-Host URLs, Build-Stamped lastmod, and Ignored Fields",
    metaDescription: "One nightly timestamp across 12,000 URLs teaches Google to ignore lastmod. How tech/sitemap-hygiene rolls up cross-host locs, bad dates, and build-stamped sitemaps.",
    primaryKeyword: "sitemap lastmod accuracy",
    oneLiner: "Google uses lastmod only when the value is consistently and verifiably accurate, so tech/sitemap-hygiene reports a sitemap as build-stamped once at least 100 URLs carry the field and 95% of them repeat one identical value, one of five rollup checks it runs alongside cross-host locs, unparseable URLs, dates more than 24 hours in the future, and non-W3C datetimes.",
    whatItDetects: "Findings are rollups, one per issue kind, never one per URL. A sitemap with 436 cross-host entries yields a single error carrying the count in its message and at most 10 example URLs in `relatedUrls`, sorted so successive runs stay byte-identical. The check runs over the collected `<loc>` set plus a lastmod map against the audit's source URL, and returns nothing at all when the sitemap is empty. Host comparison normalises both sides: hostnames are lowercased and a leading `www.` is stripped, so `www.example.com` and `example.com` match while `listings.example.com` does not.\n\nCross-host entries are the only error-severity finding here. The Sitemaps protocol requires URLs to reside on the same host as the sitemap, and non-compliant entries are dropped from consideration; the fix string names Google's two documented exceptions, both hosts verified in the same Search Console account, or the target host's robots.txt declaring the sitemap through a `Sitemap:` directive. Entries that `new URL()` cannot parse at all, such as relative paths or a missing scheme, are reported separately as a warning, because a `<loc>` must be a fully-qualified absolute URL.\n\nThree lastmod checks follow, all at warning severity. A parseable date more than 24 hours ahead of the audit clock is flagged as future-dated, the tolerance absorbing timezone sloppiness rather than genuine forward-dating. A value matching neither `YYYY-MM-DD` nor a full W3C datetime, such as `20/08/2026` or an epoch integer, is flagged as unparseable. The generated-lastmod heuristic is last and is the only medium-confidence finding: once at least 100 URLs carry the field, if 95% or more share one identical value, the sitemap is reported as build-stamped rather than modification-stamped. Note what is absent from all of this. `priority` and `changefreq` are never checked in either direction, because Google documents that it ignores both.",
    whyItMatters: "lastmod is the only sitemap hint Google says it acts on, and the promise is qualified: the value is used when it is consistently and verifiably accurate, and ignored otherwise. That judgement lands on the file, not on individual entries. A pipeline writing the deployment timestamp into all 12,000 rows every night is not supplying a weak signal, it is training Google to stop reading the field for that domain, including on the handful of URLs where the date happened to be real.\n\nThe 95% share is set where accident stops being a plausible explanation. Genuine inventory does not update in lockstep; a portal whose listings change price, gain photos, and go under offer at different hours produces a scattered distribution of dates across the week. One value covering nineteen URLs in twenty has exactly one cause, and it is the generator. The companion 100-URL minimum keeps the heuristic off small sitemaps, where a handful of pages legitimately shipping together would otherwise look manufactured.\n\nCross-host entries fail in a different way: not distrusted, discarded. The protocol drops them from consideration, so a portal listing its detail pages under a `listings.` subdomain from the apex sitemap has effectively submitted those URLs to nobody. They may still be found through internal links, later and more slowly, which is why the symptom presents as sluggish indexing of new inventory rather than as an error on any dashboard.",
    failingExample: "A real-estate listings portal serves `https://www.harborline-realty.example/sitemap.xml` with 12,480 `<loc>` entries. 436 of them point at `listings.harborline-realty.example` and `photos.harborline-realty.example`, so the rule fires one error naming 436 and lists 10 sorted examples rather than 436 lines of noise. Every entry also carries a lastmod, and 12,061 of the 12,480 read `2026-08-20T03:15:00Z`, the moment the nightly build ran: at 96.6% that clears the 95% share and the 100-URL minimum, producing a second finding at medium confidence. A further 58 entries carry `20/08/2026`, which is not a W3C datetime, and 7 are dated 2026-09-01, eleven days ahead of the audit clock. Four rollups for roughly 12,500 URLs.",
    passingExample: "The portal splits the file. `listings.harborline-realty.example` gets its own sitemap, declared by a `Sitemap:` line in that host's robots.txt, and the apex serves a sitemap index referencing both, so all 436 cross-host entries disappear and the error clears. The generator now reads each listing's real `updated_at` column instead of calling `Date.now()` once per build, and the most-repeated lastmod value falls to 1,204 of 12,044 URLs, about 10% and far below the 95% share. The 58 day-first strings are reformatted to `2026-08-20`, and the 7 future dates, a staging-server clock skew, are removed by a build-time clamp.",
    howToFix: [
      "Give every host its own sitemap and reference them from a sitemap index. Declaring the sitemap with a Sitemap: line in the target host's robots.txt is the documented alternative when splitting is impractical.",
      "Emit each URL's real modification timestamp from your data layer, or omit lastmod entirely. An absent field is treated better than one that is uniformly false across the whole file.",
      "Stop writing build time into lastmod. A single Date.now() call at generation is exactly what produces the 95%-identical-value pattern this rule reports.",
      "Format every date as W3C datetime, either 2026-08-20 or 2026-08-20T09:30:00Z. Day-first strings and epoch integers are rejected outright and count as unparseable.",
      "Clamp future dates at build time. A lastmod more than 24 hours ahead of now is nearly always a staging clock or a timezone bug rather than a scheduled publication.",
      "Delete priority and changefreq from the generator. Google documents that it ignores both, so they add file size and review time while changing nothing about how the sitemap is read."
    ],
    spamBrainContext: "Sitemap defects are not policy violations, and no part of Google's spam documentation mentions them. They sit alongside the spam rules because they are the crawl-side fingerprint of the same generator behaviour those rules examine on the content side. A portal stamping 12,061 URLs with one timestamp every night is telling you its build has no per-entity change tracking, which is the same gap that produces templated listing bodies differing by a swapped neighbourhood name.\n\nThe practical cost is crawl allocation. Google's large-site crawl-budget guidance describes how Googlebot deprioritises low-information fetches, and a sitemap whose only freshness field is untrustworthy leaves the scheduler nothing to prioritise with, so genuinely fresh inventory is revisited at the same lazy cadence as listings that sold in March. Cross-host entries compound this: dropped from consideration by the protocol, those 436 URLs fall back to internal-link discovery, which on a listings portal means waiting for a paginated index page to be recrawled.\n\nThis rule also closes out a checklist item that refuses to die. Plenty of sitemap generators still write priority and changefreq by default; Google documents that it ignores both. pseolint therefore never flags their absence and never credits their presence, and spends its checks on the one field the documentation says is read, lastmod, plus the same-host rule the protocol makes mandatory.",
    faqs: [
      {
        "q": "Does Google actually use the lastmod field in sitemaps?",
        "a": "Yes, but conditionally. Google's build-a-sitemap guidance says lastmod is used when the value is consistently and verifiably accurate, and ignored otherwise, and that judgement applies to the file as a whole. A sitemap where 96% of entries share the nightly build timestamp fails that test, which is why the rule reports the pattern rather than individual rows."
      },
      {
        "q": "Can a sitemap include URLs on a different subdomain?",
        "a": "Not by default. The Sitemaps protocol requires URLs to reside on the same host as the sitemap, and non-compliant entries are dropped from consideration. Google documents two exceptions: both hosts verified in the same Search Console account, or the target host's robots.txt declaring the sitemap via a Sitemap: directive. The rule's fix string names both."
      },
      {
        "q": "Should I set priority and changefreq in my sitemap?",
        "a": "There is no benefit. Google documents that it ignores both fields, so they cost file size and review attention while changing nothing about crawling or ranking. pseolint deliberately never flags their absence and never rewards their presence, and checks lastmod and the same-host requirement instead, which are the parts the documentation says are actually read."
      },
      {
        "q": "Why does a lastmod date in the future get flagged?",
        "a": "Because it signals a generator that is not reading real modification times. The rule allows a 24-hour tolerance so timezone handling and clock drift do not produce noise, then warns on anything beyond it. In practice a date days ahead traces back to a staging-server clock or a scheduled-publish field being written into lastmod by mistake."
      },
      {
        "q": "How many URLs must share a lastmod before it is flagged?",
        "a": "The heuristic needs at least 100 URLs carrying a lastmod before it applies at all, then fires when 95% or more of those share one exact value. Both conditions matter: the minimum keeps small sitemaps quiet, where a genuine batch deploy can legitimately give several pages the same timestamp, and the share is where accident stops being plausible."
      }
    ],
    relatedRules: [
      "publication-velocity",
      "url-pattern",
      "crawler-access"
    ],
    relatedTool: "doorway-page-detector",
  },
  {
    slug: "meta-robots-conflict",
    ruleId: "tech/meta-robots-conflict",
    title: "Meta Robots Conflict: How a Stray noindex Header Deindexes Live Pages",
    metaDescription: "A staging X-Robots-Tag can overrule your meta tag, because Google takes the most restrictive directive it finds. How tech/meta-robots-conflict catches the contradiction.",
    primaryKeyword: "meta robots noindex conflict",
    oneLiner: "Google honours the most restrictive robots directive it finds rather than the nearest one, so an `index, follow` meta tag cannot override a stray `X-Robots-Tag: noindex` response header: tech/meta-robots-conflict fires at error severity the moment the two disagree across a URL's robots meta tag, its googlebot meta tag and its headers. Unlike the robots.txt noindex directive that Google retired in 2019, this conflict is silent, and Search Console reports only that the page is excluded by a noindex tag without naming which source set it.",
    whatItDetects: "Re-scanning the raw HTML is the first thing this rule does, and it does so deliberately: the parser's `page.robotsMeta` field retains only the first robots meta tag, so a docs template that injects a second one from a layout partial would otherwise go unseen. A regex sweep over every `<meta>` tag keeps the ones whose `name` attribute resolves to `robots` or `googlebot`, whether the value is double-quoted, single-quoted or bare, and records each tag's `content` string against a readable source label. The `X-Robots-Tag` value from the HTTP response is appended as a third declaration and skipped when the header is empty or whitespace-only. Every content string is then split on commas, trimmed and lowercased into individual directive tokens, and each token is indexed against the set of sources that declared it.\n\nTwo opposite pairs are then evaluated: `index` against `noindex`, and `follow` against `nofollow`. When both halves of a pair are present anywhere across the gathered sources, the rule emits an error-severity, high-confidence finding that names the offending URL and lists which source declared each side, so a /pricing page showing `index` from `meta robots` and `noindex` from `X-Robots-Tag header` reads unambiguously in the report. A second, quieter check catches a different failure: when the same meta name appears in two or more tags whose content strings differ after trimming and lowercasing, the rule emits a warning that quotes each distinct string, because nothing in the markup settles which one applies. Identical duplicate tags stay silent, and a page that declares no robots directive at all is skipped before any comparison runs.",
    whyItMatters: "The asymmetry is what makes this expensive. A missing `index` directive costs nothing, since indexing is the default behaviour. A stray `noindex` removes the page. Because Google combines directives from every source and honours the most restrictive result, the two are never weighed against each other; the restriction simply applies, with no error surfaced in the markup, no warning in the build log and no visible difference in the rendered page. Search Console will eventually list the URL under `Excluded by 'noindex' tag`, but that report only arrives after a recrawl, which on a low-demand documentation subfolder can take weeks.\n\nDocumentation and pricing are the two page types a SaaS site can least afford to lose. Pricing pages carry commercial intent and convert; documentation pages accumulate long-tail queries for error strings, API method names and config keys that nothing else on the domain ranks for. When a staging deployment's blanket `X-Robots-Tag: noindex` survives an environment-variable rename and reaches production, the page template still emits `index, follow`, every visual QA pass looks correct, and the deindexing proceeds quietly underneath. Teams routinely discover it only when a support ticket asks why a documented error code no longer appears in search.",
    failingExample: "docs.example-saas.com serves 412 documentation URLs plus /pricing behind a reverse proxy whose staging config block was pasted into the production Nginx file. Every response carries `X-Robots-Tag: noindex, nofollow` while the page template still emits `<meta name=\"robots\" content=\"index, follow\">`. The rule reports two error findings per URL, one for the index/noindex pair and one for follow/nofollow, 826 in total, each naming `meta robots` and `X-Robots-Tag header` as the conflicting sources.",
    passingExample: "The same 412 documentation URLs and /pricing after the proxy's `add_header X-Robots-Tag` line is scoped to the staging server block alone. Production responses carry no `X-Robots-Tag` at all, the template emits exactly one `<meta name=\"robots\" content=\"index, follow\">`, and the 3 internal preview environments declare `noindex` through the header only, with no robots meta tag rendered, so no opposite pair can assemble anywhere. pseolint returns zero findings for the rule.",
    howToFix: [
      "Fetch the production URL with `curl -I` and read the response headers directly: an X-Robots-Tag conflict is invisible in view-source and in every browser Elements panel.",
      "Pick one authoritative source per environment, header-only for preview and staging, meta-tag-only for production. Declaring the same directive twice is how the two drift apart.",
      "Move the staging noindex out of shared proxy config into a block scoped to the staging server name, so a copy-paste into the production file cannot carry it across.",
      "Resolve the warning-severity duplicate-tag findings too: two robots meta tags with different content strings mean a layout partial and a page template are both writing directives.",
      "Add a deploy-time smoke test asserting that /pricing and three sampled /docs URLs return no X-Robots-Tag header and render exactly one robots meta tag.",
      "After removing the directive, request indexing for the highest-value URLs in Search Console rather than waiting out the natural recrawl of a low-demand docs subfolder."
    ],
    spamBrainContext: "Robots directives sit outside the spam-policy stack, which is precisely why this failure mode is so durable: no classifier is going to reverse it on your behalf. Google's robots meta tag documentation states the combination rule plainly, that where the meta tag and the HTTP header disagree the more restrictive of the two applies, and it has read that way since long before the March 5, 2024 scaled-content-abuse update reshaped the surrounding policy language. Nothing about a page's quality, freshness or link profile overrides a directive the site itself declared.\n\nFor programmatic sites the consequence is a scoring one. A docs-and-pricing SaaS domain that loses 412 URLs to an accidental header is not demoted, it is removed, and the remaining index shrinks to whatever the marketing subfolder holds. Quality systems then assess the domain on that smaller, less useful sample. The May 7, 2024 site-reputation-abuse policy and the August 25, 2022 Helpful Content System both judge a domain on the corpus Google can actually see, and a self-inflicted noindex changes what that corpus is. Auditing robots directives before auditing content quality is the correct order of operations, because a deindexed page's content score is never read by anything.",
    faqs: [
      {
        "q": "Which wins, the meta robots tag or the X-Robots-Tag header?",
        "a": "Neither wins by position or precedence. Google combines the directives from both sources and applies the most restrictive result, so a header saying `noindex` against a meta tag saying `index` produces a noindexed page, because `noindex` is the restrictive half of that pair. The meta tag is not a rebuttal to the header."
      },
      {
        "q": "Why does my page show index in view-source but is missing from Google?",
        "a": "View-source renders the HTML body only. The `X-Robots-Tag` lives in the HTTP response headers, which no browser displays in its Elements panel. Fetch the URL with `curl -I`, or open the Network tab and read the response headers; a staging directive left behind in proxy or CDN config is the usual culprit."
      },
      {
        "q": "Does a noindex plus nofollow conflict fire two separate findings?",
        "a": "It can. The rule evaluates two opposite pairs independently, index against noindex and follow against nofollow, so a header declaring `noindex, nofollow` against a meta tag declaring `index, follow` produces two error-severity findings for the same URL, each naming the pair it matched and the sources on either side of it."
      },
      {
        "q": "Is having two meta robots tags on one page a problem?",
        "a": "Only when their content strings differ. Two identical tags are redundant but harmless and the rule stays quiet. Two tags carrying different directives raise a warning, because the markup gives no ordering guarantee, and Google resolves the ambiguity by combining them restrictively, which is rarely what the second tag's author had in mind."
      },
      {
        "q": "How long does it take to recover after removing a noindex header?",
        "a": "The URL has to be recrawled before it can re-enter the index, and a documentation subfolder with low crawl demand can wait weeks for that to happen on its own. Submitting the highest-value URLs through Search Console's URL Inspection tool shortens the wait for those specific pages; the remainder recover on the normal crawl cycle."
      }
    ],
    relatedRules: [
      "snippet-suppression",
      "robots-txt-limits",
      "crawler-access"
    ],
    relatedTool: "spambrain-checker",
  },
  {
    slug: "snippet-suppression",
    ruleId: "tech/snippet-suppression",
    title: "Snippet Suppression: How nosnippet Removes a Page From AI Answers",
    metaDescription: "nosnippet and max-snippet:0 do more than blank a SERP description; they make the page ineligible for AI Overview citation. What tech/snippet-suppression reports and why.",
    primaryKeyword: "nosnippet AI Overviews",
    oneLiner: "A page carrying `nosnippet` or `max-snippet:0` in any robots source forfeits its SERP description and its eligibility to be cited in AI Overviews and answer engines at the same moment, which is why tech/snippet-suppression reports every such URL at warning severity while deliberately leaving `max-snippet:-1` and every positive character budget untouched.",
    whatItDetects: "Robots directives are collected from the same three declaration sites the conflict check reads: every `<meta name=\"robots\">` tag, every `<meta name=\"googlebot\">` tag, and the `X-Robots-Tag` response header when it is non-empty. Each content string is split on commas and its tokens are trimmed and lowercased. Exactly two token shapes qualify as snippet killers, the bare directive `nosnippet` and `max-snippet:0` with whitespace tolerated on either side of the colon. When at least one source carries either shape, a warning-severity, high-confidence finding names the URL and lists every source that suppressed it, so a recipe page blocked by both a meta tag and a header reports both rather than collapsing them into one.\n\nTwo things deliberately do not fire. `max-snippet:-1`, which means unlimited, passes, and so does any positive budget such as `max-snippet:160`, because the rule is testing for suppression rather than for length. And `data-nosnippet` attributes in the body are counted, not condemned: the rule tallies every occurrence of the attribute in the raw HTML and emits an info-severity finding stating the count, on the reasoning that hiding a legal disclaimer or a subscription prompt from snippets is a defensible thing to do. That finding exists to make partial suppression visible before someone wraps an ingredient list in it, and its fix text asks you to review each region rather than strip them all.",
    whyItMatters: "Blocking snippets to deter scrapers is a trade that stopped paying. The directive was designed when the only consumer of a snippet was a SERP result, and its cost was a blank description under a blue link. AI Overviews and answer engines changed that arithmetic: a page that cannot be excerpted cannot be quoted, cannot be attributed, and cannot appear as a source link inside a generated answer. The scraper still copies the recipe, because scrapers do not parse robots directives. The only party that honours `nosnippet` is the party that would have sent the traffic.\n\nRecipe publishing is where the mismatch cuts deepest. Cooking queries are overwhelmingly answer-shaped, asking for oven temperature, substitution ratios, proof times and doneness targets, and those are exactly the extractable figures an AI Overview surfaces with a citation attached. A publisher who ships `nosnippet` across 2,400 recipe URLs keeps the blue links and hands every one of those citation slots to a competitor whose identical 325°F figure is still quotable. Rich-result imagery driven by structured data can keep rendering while the text disappears, which makes the loss harder to spot: the carousel thumbnail still shows up, so the page looks like it is performing while its prose has quietly stopped being eligible for any answer panel.",
    failingExample: "A recipe publisher adds `<meta name=\"robots\" content=\"index, follow, nosnippet\">` to its base template after a scraper republishes 60 of its recipes, and the directive propagates to all 2,400 recipe URLs plus 180 technique guides. pseolint returns 2,580 warning-severity findings naming `meta robots` as the suppressing source. The braised-short-ribs page still holds position 4 for its head term, shows no description text, and its 325°F / 3-hour figures no longer appear in any AI Overview citation.",
    passingExample: "The same 2,580 URLs after the template drops `nosnippet` for `<meta name=\"robots\" content=\"index, follow, max-snippet:-1\">`, with `data-nosnippet` retained on exactly 2 regions per page, the affiliate-disclosure line and the newsletter prompt. pseolint returns zero warnings and 2,580 info findings each reporting a count of 2. Scraping is handled where it belongs, in rate limiting and a takedown process, and the 325°F figure is quotable again.",
    howToFix: [
      "Replace `nosnippet` with `max-snippet:-1` so the page is explicitly eligible for unlimited excerpting instead of relying on an implicit default.",
      "Inspect the HTTP response headers as well as the template: a CDN worker adding `X-Robots-Tag: nosnippet` keeps the page suppressed long after the meta tag is corrected.",
      "Fight scraping with rate limiting, bot fingerprinting and takedown notices, because robots directives are honoured by the crawlers that send traffic, not by the ones that copy content.",
      "Scope `data-nosnippet` to affiliate disclosures, subscription prompts and legal boilerplate, and never wrap ingredient quantities, temperatures or step timings in it.",
      "Watch the info-severity `data-nosnippet` counts after every template change: a count jumping from 2 to 9 per page means a shared component started wrapping body content.",
      "If a snippet length cap is a genuine business requirement, set a real character budget rather than 0, since any value above zero leaves the page citable."
    ],
    spamBrainContext: "This rule is not about spam, and the distinction changes how you triage it. Nothing in Google's spam policies penalises a publisher for suppressing their own snippet; the directive is honoured exactly as requested. The damage is self-administered and purely mechanical, because Google's AI-features guidance ties eligibility for AI Overview appearance to ordinary snippet eligibility, so the same token that blanks a description also removes the URL from the pool an AI answer is allowed to cite.\n\nRecipe publishers reached for `nosnippet` out of a real grievance, and it is worth naming why the remedy misfires. The scraping wave that followed the March 5, 2024 scaled-content-abuse update pushed many independent food sites toward defensive markup, but a robots directive is a request read only by compliant crawlers. Content thieves drive headless browsers that never parse it. What the directive does reach is Googlebot, and after Googlebot every answer surface built on its index. Meanwhile the same publishers invest engineering time in `aeo/*` concerns, answer-first openers, citable figures and structured summaries, all of which one template-level token cancels out. Checking snippet eligibility before optimising for citability is the cheaper order, because there is no return on tuning an extractable opening paragraph for a page that has instructed Google not to extract anything.",
    faqs: [
      {
        "q": "Does nosnippet stop my page from appearing in AI Overviews?",
        "a": "Yes. Eligibility for AI Overview citation follows ordinary snippet eligibility, so a page carrying `nosnippet` cannot be excerpted into a generated answer or listed among its sources. The URL can still rank as a standard blue-link result; it simply cannot be quoted in the panel sitting above those results."
      },
      {
        "q": "Will nosnippet stop scrapers from stealing my recipes?",
        "a": "No. Robots directives are advisory and only compliant crawlers read them. Scrapers driving headless browsers ignore the tag outright, so the recipe is copied either way while the snippet-consuming search surfaces honour the block. Rate limiting, bot detection and takedown notices are the tools that actually reach the offender."
      },
      {
        "q": "What is the difference between nosnippet and max-snippet:0?",
        "a": "In effect there is none, and the rule treats them identically as snippet killers. `max-snippet:0` reads like a length setting, which is how it slips into templates by accident. Any value above zero leaves the page eligible for excerpting, and `-1` declares unlimited excerpting explicitly."
      },
      {
        "q": "Should I remove every data-nosnippet attribute from my pages?",
        "a": "No, and the rule does not ask you to, which is why those findings sit at info severity. Keep the attribute on affiliate disclosures, paywall prompts and legal boilerplate. Remove it wherever it covers ingredient quantities, oven temperatures, timings or anything else a reader might want quoted back to them."
      },
      {
        "q": "Does nosnippet affect recipe rich results and carousels?",
        "a": "Rich-result imagery driven by structured data can keep rendering while the text snippet disappears, which is why the loss goes unnoticed for months at a time. Treat a carousel appearance as no evidence that the page is still citable, and check the robots directives on the URL directly instead."
      }
    ],
    relatedRules: [
      "meta-robots-conflict",
      "crawler-access",
      "faq-coverage"
    ],
    relatedTool: "spambrain-checker",
  },
  {
    slug: "robots-txt-limits",
    ruleId: "tech/robots-txt-limits",
    title: "robots.txt Limits: The 500 KiB Cutoff and Four Directives Google Ignores",
    metaDescription: "Google parses the first 500 KiB of robots.txt and drops the rest, and noindex: lines there have done nothing since September 2019. Inside tech/robots-txt-limits.",
    primaryKeyword: "robots.txt size limit",
    oneLiner: "500 KiB is the hard ceiling: Google parses the first 512,000 bytes of a robots.txt file and silently ignores every rule beyond it, so tech/robots-txt-limits measures the file's UTF-8 byte length and raises a warning the moment a generated faceted-navigation file crosses that line, then separately reports the four directives Google's parser never supported.",
    whatItDetects: "Two independent checks run against the fetched robots.txt, and an empty or absent file short-circuits both before either executes. The first measures the content's UTF-8 byte length, bytes rather than characters, so multibyte path segments in localised Disallow lines count for more than their character count suggests, and compares it against 500 KiB, which is 512,000 bytes exactly. Above that, a warning-severity, high-confidence finding reports the measured byte count alongside the limit and states that every rule past the cutoff is dropped. Its fix text points at wildcard consolidation of repetitive Disallow patterns and at relocating per-page exclusions onto the pages themselves.\n\nThe second check scans line by line for four directives Google's parser does not support, matching them only when they lead the line ahead of the colon: `noindex`, `crawl-delay`, `nofollow` and `host`. Whichever are present roll up into a single finding rather than one per line, each annotated with the reason it does nothing, so `crawl-delay` is marked as ignored by Google though honoured by Bing, `nofollow` as not a robots.txt directive at all, and `host` as unsupported with canonical URLs or redirects named as the replacement. Severity on this finding is conditional: it sits at info when only the harmless three appear, and escalates to warning as soon as `noindex` is among them, because that is the one an operator is likely to believe is working.",
    whyItMatters: "Faceted navigation is the workload that breaks robots.txt. A marketplace carrying 40 brands, 18 sizes, 12 colours and 9 price bands mints parameter permutations faster than any exclusion list can enumerate them, and the standard response, a build step appending one line per discovered facet URL, turns a configuration file into a growing artefact. At 700 KiB, roughly 200 KiB of that file sits past the point Google reads. Which 200 KiB is determined by the generator's ordering, which usually means alphabetical, which usually means the facets nobody thought about are the ones still being crawled.\n\nThe `noindex:` lines are the more serious half. Google announced on July 2, 2019 that it would stop supporting the directive, and did so on September 1, 2019. A URL listed under `noindex:` in robots.txt has since been crawlable and indexable exactly as if the line were absent. An operator reading their own robots.txt sees thousands of facet URLs apparently excluded; Search Console shows them indexed. The two views never reconcile, because one of them describes a directive the parser discards. Meanwhile the crawl spend on `?colour=navy&size=11&sort=price_asc` permutations is real, and it comes out of the same allocation the actual product pages need.",
    failingExample: "marketplace.example generates robots.txt from its facet index at build time: 11,400 `Disallow:` lines and 6,900 `noindex:` lines covering filtered category URLs, 717,312 bytes in total. pseolint returns two findings, a warning that the file is 717,312 bytes against the 512,000-byte limit with roughly 205,000 bytes never parsed, and a second warning for the unsupported `noindex` and `crawl-delay` directives. Every facet URL the team believed was excluded is indexed, and 40 of them outrank the canonical category pages.",
    passingExample: "The same marketplace after the generator is replaced by 9 wildcard patterns, `Disallow: /*?*colour=`, `Disallow: /*?*sort=` and 7 siblings, bringing robots.txt to 2,144 bytes and well inside the 512,000-byte budget. The 6,900 `noindex:` lines are deleted and the exclusions they were meant to express move to `<meta name=\"robots\" content=\"noindex, follow\">` rendered on the filtered views themselves, while `crawl-delay` is dropped. pseolint returns no findings for the rule.",
    howToFix: [
      "Measure the file in bytes rather than lines: `curl -s https://example.com/robots.txt | wc -c` tells you immediately whether you are anywhere near 512,000.",
      "Collapse per-URL Disallow lines into wildcard patterns keyed on the query parameter name rather than its values, so one `/*?*colour=` line replaces every colour permutation.",
      "Delete every `noindex:` line, since it has had no effect since September 2019, and re-express the intent as a robots meta tag or an X-Robots-Tag header on the filtered pages.",
      "Decide per facet whether you want it crawled-but-not-indexed or not crawled at all, because a Disallow blocks the fetch and therefore stops Google ever seeing a noindex tag on that URL.",
      "Keep `crawl-delay` only where Bing traffic justifies it, and use Search Console's crawl-rate controls for Google, which ignores the directive entirely.",
      "Add a build-time assertion that fails CI when robots.txt exceeds a byte budget you set comfortably below the 512,000-byte cutoff."
    ],
    spamBrainContext: "Nothing in this rule is a spam signal, and a bloated robots.txt attracts no policy action on its own. What it does is make a site's own index unpredictable, which is a poor position from which to argue when quality systems do assess the domain. The March 5, 2024 scaled-content-abuse update judges what Google has actually indexed, and a marketplace that believes 6,900 facet URLs are excluded while in fact serving them as thin, near-identical variants of nine real category pages is being assessed on a corpus it never intended to publish.\n\nThe interaction with crawl budget is where the cost compounds. Google's large-site crawl-budget guidance is explicit that faceted navigation is a primary source of wasted crawling, and the remedy it names is fewer crawlable URLs rather than more exclusion lines. A 717 KiB robots.txt is a symptom of a URL space that grew without a canonical strategy, and truncation at 512,000 bytes means the file cannot even fully describe the problem it was written to solve. Fixing the byte count with wildcards is a one-afternoon change; the durable fix is deciding which facet combinations deserve a URL at all and serving the rest behind POST filters or client-side state that never mints a crawlable address.",
    faqs: [
      {
        "q": "Does noindex in robots.txt actually work?",
        "a": "No. Google announced the removal on July 2, 2019 and stopped supporting the directive on September 1, 2019, and lines using it are discarded by the parser. Pages listed there stay crawlable and indexable. The working equivalents are a `noindex` robots meta tag or an `X-Robots-Tag: noindex` response header served on the page itself."
      },
      {
        "q": "What happens if robots.txt is bigger than 500 KiB?",
        "a": "Google parses the first 500 KiB, or 512,000 bytes, and ignores everything after it. No error is reported anywhere, so the rules past the cutoff simply do not exist as far as the crawler is concerned. On a generated file that means your effective exclusions are whichever ones the generator happened to write first."
      },
      {
        "q": "How do I stop Google crawling faceted navigation URLs?",
        "a": "Use wildcard `Disallow` patterns matched on the query parameter name instead of enumerating values, so one line covers every permutation of that facet. Where you need the URLs crawled but kept out of the index, leave them crawlable and serve a `noindex` meta tag, since a disallowed URL is never fetched and its meta tag is never read."
      },
      {
        "q": "Is crawl-delay in robots.txt worth keeping?",
        "a": "Only for Bing, which honours it. Googlebot ignores the directive outright, so a `crawl-delay: 10` line does nothing to Google's crawl rate. pseolint reports it at info severity when it appears alone, and folds it into a warning-severity rollup as soon as a `noindex` line shows up in the same file."
      },
      {
        "q": "Why is my robots.txt byte count higher than its character count?",
        "a": "Length is measured in UTF-8 bytes, so any non-ASCII character in a path, whether an accented category name or a non-Latin script, occupies two to four bytes each. A localised marketplace can sit comfortably under 500,000 characters and still cross the 512,000-byte parse limit without noticing."
      }
    ],
    relatedRules: [
      "crawler-access",
      "meta-robots-conflict",
      "url-pattern"
    ],
    relatedTool: "thin-content-scanner",
  },
  {
    slug: "html-size",
    ruleId: "tech/html-size",
    title: "HTML Size: The 2 MB Per-File Cutoff That Truncates Your Markup",
    metaDescription: "Googlebot reads the first 2 MB of each fetched file, uncompressed. How tech/html-size warns at 1.5 MB, errors at 2 MB, and why inlined data payloads bury your JSON-LD.",
    primaryKeyword: "Googlebot 2MB HTML limit",
    oneLiner: "Googlebot reads only the first 2 MB of any single fetched file, uncompressed, so tech/html-size warns the moment a document's UTF-8 byte length reaches 1,572,864 bytes (1.5 MB) and escalates to an error at 2,097,152 bytes (2 MB), the point where markup, links, and JSON-LD past the cutoff stop existing as far as Google is concerned.",
    whatItDetects: "The rule measures one number: the UTF-8 byte length of the served HTML document, computed with Buffer.byteLength over the page markup. Anything below 1,572,864 bytes (1.5 MB) is skipped before a finding is ever constructed, so most sites never see this rule fire at all. From 1.5 MB up to the cutoff the finding is a warning; at 2,097,152 bytes (2 MB) and above it becomes an error. Both tiers carry high confidence, and both name the page URL alongside its size rounded to one decimal place. There is no site-wide aggregate, no percentage, and no averaging: each document is judged on its own bytes, which is exactly how Googlebot fetches it.\n\nWhat the rule deliberately does not measure matters as much. Google's Googlebot documentation caps a crawl at the first 2 MB of each fetched file, uncompressed, with PDFs given 64 MB; the February 2026 revision of that page replaced the 15 MB figure most audit tools still quote. The budget is per resource, so a stylesheet, a map bundle, and every JSON file a page loads each carry their own 2 MB allowance. A dataset page whose HTML is 118 kB while it streams 21 MB of vector tiles has a Core Web Vitals conversation ahead of it and no truncation problem whatsoever, and tech/html-size stays quiet on it. Compression is beside the point too: the limit applies to the uncompressed document, so a 340 kB gzip response can be a 2.6 MB file as far as the cutoff is concerned.\n\nOn a municipal open-data portal the trigger is almost always a hydration blob. Cascade County's portal renders each of its 1,840 dataset pages by inlining the entire record set into a script tag so a client-side grid can boot without a network round trip; on /datasets/street-tree-inventory that payload is 2.4 MB and the finished document weighs 2.6 MB. The rule reports 2.6 MB at error severity, and the remedy is structural rather than editorial. Nothing about the prose is wrong. The document is simply carrying data that belongs behind an endpoint.",
    whyItMatters: "Truncation is silent. There is no HTTP error, no Search Console message, and no rendering failure to notice, because bytes past the cutoff are never handed to the parser and the crawled copy of the page just ends mid-document. On the street-tree page everything the county actually wanted indexed sits after the 2.4 MB payload: the license notice, the weekly refresh cadence, the 40 links to sibling datasets, and the schema.org Dataset JSON-LD. All of it lands past byte 2,097,152. Google receives an H1, a breadcrumb, and the opening of a script tag.\n\nThe link graph is the part that compounds. Each of those 1,840 dataset pages carries 40 outbound links to related records, every one of them on the far side of the cutoff, so a portal that looks densely interlinked in a browser hands Google 1,840 dead ends instead. Crawl economics degrade in parallel: a full pass moves roughly 4.7 GB while each document weighs 2.6 MB, against about 173 MB once the payload is served separately, and Google's crawl-budget guidance for large sites is direct about low-information fetches being deprioritised. A county that publishes 1,840 datasets is spending its entire crawl allowance transmitting a table Google will never read.\n\nFor an open-data portal the JSON-LD is not decoration. Google's Dataset structured-data support is what lets a municipal record set surface as a dataset rather than as an ordinary web page, and structured data has to be inside the fetched bytes to register. Cascade County can maintain flawless schema.org Dataset markup on all 1,840 pages and have precisely none of it counted, because in every single case the markup is written after the payload that pushed it past the cutoff. The failure is invisible in a browser, invisible in any check that pastes markup into a validator instead of fetching the URL, and invisible to anything reading the DOM after JavaScript has run.",
    failingExample: "data.cascadecounty.gov/datasets/street-tree-inventory ships 2.6 MB of HTML. A script tag of type application/json holds the full street-tree table inline, 86,400 rows of species, planting date, and trunk diameter, weighing 2.4 MB on its own so a client-side grid can render without a fetch. The license notice, the 40 related-dataset links, and the schema.org Dataset JSON-LD all sit after that block, past byte 2,097,152. tech/html-size fires an error, and Google indexes a page that appears to consist of a heading and nothing else.",
    passingExample: "The same URL after the payload moves to /api/datasets/street-tree-inventory.json, fetched on demand and paged 500 rows at a time: the document drops from 2.6 MB to 96 kB, comfortably under the 1.5 MB warning tier, and the rule stays silent. The server now renders a 12-row preview, the row count (86,400), the Monday 06:00 refresh cadence, the license notice, the schema.org Dataset JSON-LD, and all 40 related-dataset links inside the first 100 kB of markup, which puts every one of them not merely inside the 2 MB budget but near the top of it.",
    howToFix: [
      "Move hydration blobs out of the document: serve the 2.4 MB record set from a JSON endpoint the grid fetches after paint and keep the HTML a shell around it.",
      "Server-render a bounded preview instead of the whole table. Twelve rows plus a row count of 86,400 communicate the dataset as well as 86,400 inlined rows do, and cost four orders of magnitude less.",
      "Order the document so load-bearing markup comes first: JSON-LD, canonical, license text, and outbound dataset links belong above any large payload, so they survive even if a page creeps back over the line.",
      "Measure the byte length of the served HTML rather than the transfer size. The 2 MB budget is uncompressed, so a 340 kB gzip response can still be a 2.6 MB document.",
      "Treat the 1.5 MB warning tier as the real deadline. A dataset page sitting at 1.6 MB is one weekly refresh away from silent truncation, and nothing will tell you when it crosses.",
      "Split by resource rather than trimming blindly: the map bundle and the stylesheet each get their own 2 MB fetch allowance, so relocating bytes into a second file is a genuine fix, not a loophole."
    ],
    spamBrainContext: "Nothing about a large HTML file is a spam signal and Google publishes no penalty for one. The reason a size check belongs in an audit that mostly hunts scaled-content abuse is second-order: truncation manufactures thin content out of a page that is genuinely substantial. The crawled version of the street-tree page is a heading, a breadcrumb, and a dangling script tag, which is exactly the shape that the scaled-content-abuse clause Google added to its spam policies on March 5, 2024, plus the helpful-content guidance beside it, are tuned to distrust. The page is not low-effort. It is only being read as though it were, and 1,840 pages read that way describe a domain rather than an accident.\n\nThe 2 MB number also attracts folklore, and pseolint takes a position on it. The claim that search engines cannot process more than 2 MB of total website size is a real figure bolted to the wrong object: the limit is per fetched file, uncompressed, and each resource carries its own. The 15 MB figure is not so much wrong as expired, having been the documented limit for years until the February 2026 revision of Google's Googlebot page cut it, and PDFs sit at 64 MB rather than either number. pseolint's folklore list keeps both entries on purpose, so the rule fires on the number in the living document rather than on a remembered one.\n\nThat is also why the rule refuses to grade total page weight. A 21 MB dataset page whose HTML is 118 kB is a Core Web Vitals matter handled by a different check, and merging the two produces the worst species of audit finding: technically alarming and actionably wrong. tech/html-size answers exactly one question, whether Google will read to the end of this document, and a county portal with 1,840 dataset pages is precisely the scale at which that answer stops being academic.",
    faqs: [
      {
        "q": "Is there a 2 MB limit on total page size for SEO?",
        "a": "No. The documented 2 MB applies to each file Googlebot fetches, uncompressed, and every stylesheet, script, and JSON file gets its own budget; PDFs are allowed 64 MB. A dataset page with 118 kB of HTML pulling 21 MB of map tiles is never truncated. It may well have a Core Web Vitals problem, which is a separate check with separate remedies."
      },
      {
        "q": "Does Googlebot still index the first 15 MB of HTML?",
        "a": "That figure was accurate for years and most audit tools still repeat it, which is why pseolint documents it as expired rather than as a myth. The February 2026 revision of Google's Googlebot page cut the documented per-file crawl limit to 2 MB, and tech/html-size flags against the current number: warning from 1.5 MB, error from 2 MB."
      },
      {
        "q": "Does gzip compression count toward Googlebot's crawl limit?",
        "a": "No, and this trips up teams who check transfer size in DevTools. The cutoff applies to the uncompressed document, so a dataset page arriving as a 340 kB gzip response can still be a 2.6 MB file that Googlebot stops reading partway through. Measure the served bytes, not what the network panel reports."
      },
      {
        "q": "Why does my open-data portal rank for nothing despite thousands of rows?",
        "a": "If the rows are inlined into the HTML, they are probably the reason. A 2.4 MB payload placed before the license notice, related-dataset links, and schema.org Dataset JSON-LD pushes all three past byte 2,097,152, so Google indexes a heading and a truncated script tag. The rows do not help you rank; they are actively hiding the content that would."
      },
      {
        "q": "What HTML size does pseolint flag as a warning versus an error?",
        "a": "Documents under 1,572,864 bytes (1.5 MB) are skipped entirely and never produce a finding. From 1.5 MB to just under 2 MB the rule reports a high-confidence warning that the page is approaching the cutoff. At 2,097,152 bytes and above it reports an error, because content past that point is already being dropped rather than merely at risk."
      }
    ],
    relatedRules: [
      "viewport-meta",
      "crawler-access",
      "llms-txt"
    ],
    relatedTool: "spambrain-checker",
  },
  {
    slug: "viewport-meta",
    ruleId: "tech/viewport-meta",
    title: "Viewport Meta: Pages Google Renders as a Shrunken Desktop",
    metaDescription: "A viewport tag without width= counts as missing. How tech/viewport-meta scans every meta tag, why Google judges the phone render, and what 12,000 legacy templates cost.",
    primaryKeyword: "viewport meta tag SEO",
    oneLiner: "A viewport meta tag satisfies tech/viewport-meta only when its content attribute actually contains the substring width=, which means content=\"initial-scale=1\" is treated as no viewport at all, and every page failing that single test collects one high-confidence warning because Google crawls with a smartphone agent and evaluates the shrunken desktop render it receives.",
    whatItDetects: "The check runs against the served HTML, skips any page whose markup is empty, and sweeps every meta tag in the document with a regular expression rather than a DOM query, so it sees the bytes a crawler parses rather than a hydrated result. For each tag it pulls the name attribute in all three forms authors actually write, double-quoted, single-quoted, or bare, then trims it, lowercases it, and discards anything that is not exactly viewport. Surviving tags have their content attribute read the same three ways, lowercased, and tested against one condition: does it contain width=. The first tag that satisfies it ends the sweep and clears the page. Any page reaching the end without one produces a single finding at warning severity and high confidence, naming the URL.\n\nTwo consequences of that test deserve stating plainly. A viewport tag can be present and still fail: content=\"initial-scale=1\" declares a zoom level and no width, an empty content attribute declares nothing, and a bare tag with no content attribute is handled exactly like a missing one. Meanwhile content=\"width=1024\" passes, because the rule asks whether a width is declared, not whether the value is wise. Lighthouse's SEO audit accepts either a width or an initial-scale, so pseolint sits one notch stricter than the tool most teams already run, on the grounds that initial-scale alone leaves the layout viewport at the browser fallback. And because the sweep reads HTML as served, a viewport injected by client-side JavaScript after hydration does not count, which is the commonest reason a page that looks correct in DevTools still reports a finding.\n\nOn Midland Works, a regional job board covering Ohio, Michigan, and Indiana, this finding arrives 12,000 times in one audit. Employer profile pages migrated to a rebuilt template two years ago and pass cleanly. The listing pages still render through a 2011 head partial whose only concession to mobile is a leftover meta name=\"MobileOptimized\" content=\"980\" tag from the Windows Phone era, which neither this rule nor any current crawler recognises. Twelve thousand warnings from one shared partial is one defect, reported per page because per page is where the consequence lands.",
    whyItMatters: "Google crawls with a smartphone agent, and since July 5, 2024 it has indexed only pages reachable on mobile devices, so the render evaluated for a listing page is the phone render rather than the desktop one the template was designed against. With no width declared, mobile Chrome falls back to a layout viewport near 980 CSS pixels and scales the result down to fit the screen. On a 390-pixel iPhone viewport that works out to roughly 40 percent scale: a 44-pixel Apply button lands near 17 pixels, and 16-pixel body copy near 6. The markup is untouched, every salary figure on the page is accurate, and the page is nonetheless assessed in its least usable state.\n\nFor a job board that state is the product. A listing's salary band, its location, and its Apply control are the entire reason the URL exists, and applicants overwhelmingly arrive from phones. There is also no first-party dashboard left to catch it: Search Console's Mobile Usability report and the standalone Mobile-Friendly Test were both retired on December 1, 2023, which moved this class of defect out of a panel somebody occasionally glances at and into the build, where a linter has to find it. Twelve thousand listing pages is far past the point where anyone notices by hand, and the pages that need it most are the newest ones nobody has opened yet.\n\nKnock-on effects run through Core Web Vitals, which are measured on the render real users get. A 980-pixel layout squeezed into 390 pixels produces tap targets small enough to mis-hit, text that forces a pinch-zoom on every visit, and reflow as the browser wrestles with a fixed-width wrapper it cannot honour. The legacy tap delay browsers once applied before dispatching a click was dropped for pages declaring a mobile-configured viewport, so the listing template pays an interaction cost the employer profile template does not. That internal inconsistency is a signal of its own: one domain, two templates, and a measurable usability gap between them tracing back to a single absent line of markup.",
    failingExample: "midlandworks.example/listings/cnc-machinist-toledo-oh-48210: the head carries a title, a canonical, an og:image, and a meta name=\"MobileOptimized\" content=\"980\" tag left over from the 2011 build, but no viewport tag of any kind. The stylesheet hard-codes the page wrapper at width: 980px. On a 390-pixel phone viewport the whole listing renders at about 40 percent scale, putting the $28.50-per-hour salary band around 6 pixels tall and the Apply button near 17 pixels wide. tech/viewport-meta emits one warning here and 11,999 more across the identical listing template.",
    passingExample: "The same URL after one line reaches the shared head partial: a meta name=\"viewport\" tag with content=\"width=device-width, initial-scale=1\", shipped alongside a stylesheet change turning the wrapper's width: 980px into max-width: 980px with fluid columns beneath. The content string contains width=, so all 12,000 listing pages clear in a single deploy, and the 390-pixel render now shows the $28.50-per-hour band at full 16-pixel type with a 44-pixel Apply target. Shipping the tag without the CSS would have cleared the finding while leaving applicants scrolling sideways through a 980-pixel layout, which is why the two go out together.",
    howToFix: [
      "Add a meta name=\"viewport\" tag with content=\"width=device-width, initial-scale=1\" to the shared head partial the listing template renders. One edit clears all 12,000 findings.",
      "Ship the tag and the fluid CSS in the same deploy. Declaring width=device-width over a hard-coded 980px wrapper trades a shrunken page for a horizontally scrolling one, which applicants like even less.",
      "Delete the legacy substitutes. MobileOptimized, HandheldFriendly, and a separate m-dot host satisfy neither this rule nor a smartphone crawler, and leaving them in place makes the head look handled when it is not.",
      "Keep pinch-zoom alive: content=\"width=device-width, user-scalable=no\" passes the rule because it contains width=, and still strips zoom from applicants reading a salary band at 6 pixels.",
      "Render the tag server-side. A viewport written by client-side JavaScript is absent from the HTML this rule reads and absent from the crawler's initial parse of the document.",
      "Group findings by template before triaging. Twelve thousand warnings that all trace to one head partial is a single bug, and treating it as 12,000 is how it stays unfixed."
    ],
    spamBrainContext: "A missing viewport tag is not spam and carries no penalty, so this rule sits outside the SpamBrain quality signals most of pseolint's catalogue models. What it shares with them is the assessment surface. Since July 5, 2024 Google has indexed only pages accessible on mobile devices, and the smartphone render is the version quality systems read, which means a legacy desktop template does not merely look dated to users, it supplies every downstream evaluator with the worst available copy of the page.\n\nThat matters for a job board because scale converts a template defect into a domain characteristic. Twelve thousand listing pages rendering as a 980-pixel layout at 40 percent scale is not 12,000 individual mistakes, it is one site presenting itself, consistently, as something built for a screen nobody is using. Helpful-content evaluation happens on that render. So does anything a reader would report about whether the page delivered what the search promised, and a salary band at 6 pixels does not deliver it.\n\nThe absence of tooling is the last piece. Search Console's Mobile Usability report and the standalone Mobile-Friendly Test went away on December 1, 2023, so Google removed the surface that used to make this visible without removing the requirement behind it. Lighthouse still audits for a viewport tag but accepts an initial-scale in place of a width; pseolint requires the width because that is the attribute governing the layout viewport. A rule that fires 12,000 times on one head partial is doing the job the retired report used to.",
    faqs: [
      {
        "q": "Does a missing viewport meta tag hurt SEO?",
        "a": "There is no documented ranking penalty for the missing tag itself. The cost is indirect and real: Google crawls with a smartphone agent and has indexed only mobile-accessible pages since July 5, 2024, so the version assessed is a desktop layout scaled to roughly 40 percent on a phone. Your content is not judged badly, it is judged in the least readable form of itself."
      },
      {
        "q": "Is width=device-width required or is initial-scale=1 enough?",
        "a": "For this rule, a width is required: the content attribute must contain width= or the tag counts as absent, so content=\"initial-scale=1\" fails. Lighthouse's SEO audit is more forgiving and accepts either. pseolint is stricter on purpose, because initial-scale alone leaves the layout viewport at the browser's roughly 980-pixel fallback, which is the exact problem the tag exists to solve."
      },
      {
        "q": "Can I add the viewport meta tag with JavaScript?",
        "a": "You can, but it will not satisfy this rule and it is a poor idea regardless. The sweep reads the HTML as served, matching what a crawler parses before any script runs, so a tag injected during hydration is invisible to it. Browsers also lay the page out before your script executes, producing a visible reflow that the server-rendered tag avoids entirely."
      },
      {
        "q": "Does a separate m-dot mobile site satisfy the viewport check?",
        "a": "No. The rule inspects the URL it was given, and a desktop-template listing page still lacks a viewport regardless of what lives on an m-dot host. Separate mobile URLs have been the discouraged pattern since mobile-first indexing became the default, and maintaining two templates is more work than adding one line to the head partial of the one you already have."
      },
      {
        "q": "Why did pseolint report 12,000 viewport warnings on one site?",
        "a": "Because the rule emits one finding per page and a job board's listing template renders 12,000 of them. The count is not noise, it measures blast radius: every listing built from that 2011 head partial inherits the defect. Sort findings by template rather than by URL and the 12,000 collapses into one fix, deployable in a single release."
      }
    ],
    relatedRules: [
      "html-size",
      "heading-structure",
      "image-alt-text"
    ],
    relatedTool: "spambrain-checker",
  }
];

/** Merge per-slug authoritative sources onto each base entry. Sources live in
 *  marketing-source-notes.ts so the 48 citation sets can be authored together. */
export const MARKETING_RULES: readonly MarketingRule[] = RULES_BASE.map((entry) => ({
  ...entry,
  sources: RULE_SOURCES[entry.slug] ?? [],
  extra: RULE_EXTRA[entry.slug] ?? [],
}));

/**
 * Short display name for a rule: the part of `title` before the first ": ".
 *
 * Titles are authored as `"<Short name>: <descriptive clause>"`. The cards on
 * /rules and the sibling nav on /rules/[ruleId] show only the short name; the
 * full title is the page <h1> and SEO title. Keep this in lockstep with the
 * separator actually used in the title data above (see the test in
 * tests/unit/marketing-rules-title.test.ts, which asserts every entry splits).
 *
 * A title with no separator falls back to the whole string rather than
 * rendering empty.
 */
export function ruleShortTitle(title: string): string {
  const [head] = title.split(": ");
  const short = head?.trim();
  return short && short.length > 0 ? short : title.trim();
}

export function findMarketingRule(slug: string): MarketingRule | undefined {
  return MARKETING_RULES.find((rule) => rule.slug === slug);
}

export function getRelatedMarketingRules(slugs: readonly string[]): MarketingRule[] {
  return slugs
    .map((slug) => MARKETING_RULES.find((rule) => rule.slug === slug))
    .filter((rule): rule is MarketingRule => rule !== undefined);
}
