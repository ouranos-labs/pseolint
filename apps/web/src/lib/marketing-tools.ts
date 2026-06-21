/**
 * Free SEO tool entries — each one is a marketing/landing page that frames the
 * pseolint audit through a specific lens (SpamBrain rules, thin content,
 * doorway patterns). Backed by the same POST /api/audits endpoint as the
 * homepage; the differentiation is editorial framing + ranked search demand,
 * not a separate engine.
 *
 * Copy is intentionally hand-written per tool — no template strings, no
 * find-replace duplication. Each entry is unique enough to pass our own
 * thin-content rules.
 */
import { SCORED_RULE_COUNT } from "@pseolint/core/rules/scope";
import { ENGINE_VERSION } from "@/lib/version";
import type { MarketingSourceRef } from "./marketing-sources";
import { TOOL_SOURCES } from "./marketing-source-notes";
import { TOOL_EXTRA, type MarketingExtra } from "./marketing-extra-content";

export type MarketingToolFaq = {
  q: string;
  a: string;
};

export type MarketingTool = {
  /** URL slug under /tools/[slug]. Stable, lowercase, hyphen-separated. */
  slug: string;
  /** Page <h1> and <title>. Concise, keyword-led, human. */
  title: string;
  /** <meta name="description">, ~150-160 chars. */
  metaDescription: string;
  /** Hero subhead, ~20 words. Sets the promise above the fold. */
  shortPitch: string;
  /** Single primary search term this page targets. */
  primaryKeyword: string;
  /** Which rule subset the tool emphasizes ("spam/*", "spam/thin-content", etc). */
  ruleLens: string;
  /** One paragraph explaining what the tool does. */
  what: string;
  /** One paragraph explaining why it matters (post-2024 SpamBrain reality). */
  why: string;
  /** 4-6 bullet points of mechanism. */
  howItWorks: string[];
  /** 4-6 bullet points of output. */
  whatYouGet: string[];
  /** 4-6 FAQ pairs (FAQPage schema bait). */
  faqs: MarketingToolFaq[];
  /** 2-3 slugs of related tools/rules/symptoms. */
  related: string[];
  /** 2-4 authoritative citations with page-specific notes. */
  sources: MarketingSourceRef[];
  /** Optional "in practice" worked-example paragraphs (page-specific scenario). */
  extra?: MarketingExtra;
};

const TOOLS_BASE = [
  {
    slug: "spambrain-checker",
    title: "Free SpamBrain checker for programmatic SEO sites",
    metaDescription: `Audit your site against ${SCORED_RULE_COUNT} inferred SpamBrain signals in 60 seconds. No signup. Spot scaled-content, doorway, and reputation-abuse patterns before Google does.`,
    shortPitch:
      "Scan any URL against the SpamBrain-adjacent rule set the team built after the March 2024 core update. No signup, runs in 60 seconds.",
    primaryKeyword: "spambrain checker",
    ruleLens: "spam/*",
    what:
      "The SpamBrain checker runs the full pseolint rule set — site-type-aware SpamBrain + AEO scoring with the dedicated spam/* rules at the core — against a sample of your site, focused on the structural signals Google's SpamBrain classifier has been documented or strongly suspected to weight. We crawl your sitemap, fetch up to 200 pages on the free tier, and report every page-level finding plus a domain-level risk score from 0 (clean) to 100 (almost certainly being demoted). Median audit time is 60 seconds. The audit is read-only, respects robots.txt, and doesn't require you to install a tag, give us GSC access, or sign up.",
    why:
      "SpamBrain originally launched in 2018 and was rebuilt on a new ML stack on August 25, 2022, becoming Google's primary spam detection system. It has been the enforcement engine behind two of the most aggressive policies of the last two years: the March 5, 2024 scaled content abuse update and the May 7, 2024 site reputation abuse policy (https://developers.google.com/search/docs/essentials/spam-policies). Google reported that the March 2024 Core Update aimed to reduce low-quality, unoriginal content in search results by 45%. Both policies targeted programmatic patterns that used to rank — automated city pages, AI-spun product comparisons, third-party content rented onto reputable subdomains. The checker exists because most pSEO operators only learn they crossed the line after a manual action notice or a 70% traffic drop. By that point you're rebuilding from scratch. Auditing structural signals before Google scores them is the only way to ship pSEO at scale without playing reactive defense — which is why the free tier gives you a 60-second sample and Pro at $19/month adds scheduled monitoring with up to 500-page manual re-audits.",
    howItWorks: [
      "Paste any public URL — the homepage, a hub page, or a representative template page works equally well.",
      "We pull your sitemap.xml and sample up to 200 URLs on the free tier, weighted toward URL patterns that look templated (high-cardinality path segments are oversampled).",
      "Each fetched page is parsed and run through the full SpamBrain + AEO rule set — including the spam/* SpamBrain-adjacent rules covering thin content, doorway patterns, scaled boilerplate, internal-link cliques, and reputation-abuse signals — weighted by your site's archetype.",
      "Findings are aggregated into a single risk score (0-100) plus a per-page tile map so you can see whether the problem is one bad template or evenly distributed.",
      "Every finding links to the specific rule explanation, the page where it fired, and the smallest fix that would clear it.",
    ],
    whatYouGet: [
      "A 0-100 SpamBrain risk score, color-coded the way the report page uses it.",
      "A tile map of every audited page — green/yellow/red based on the worst rule that fires on that URL.",
      "A ranked list of failing rules with a count of affected pages and a one-line plain-English description.",
      "Per-page drill-down: click a tile to see exactly which rules fired, with HTML snippets where relevant.",
      "Shareable report URL (24h retention for anonymous audits) so you can hand the finding to a developer or content lead.",
    ],
    faqs: [
      {
        q: "Is this actually checking SpamBrain or just guessing?",
        a: "We don't have access to Google's SpamBrain classifier — nobody outside Google does. The checker runs against rules we inferred from public Search Central documentation, the March 2024 and May 2024 spam policy updates, leaked Search API documents, and observed before/after patterns on sites that got hit. Treat the score as a structured second opinion, not a verdict. If your score is high, Google probably agrees; if it's low, you've eliminated the obvious failure modes.",
      },
      {
        q: "Will running the audit hurt my site or get me penalized?",
        a: `No. We send standard GET requests with a clearly identified user agent (pseolint/${ENGINE_VERSION} +https://pseolint.dev/bot), respect robots.txt and Crawl-delay, cap concurrency at 5, and stop at 50 pages or 50 MB total. Your analytics won't see the traffic and Search Console won't flag anything. Audits are read-only.`,
      },
      {
        q: "How is this different from a generic SEO crawler like Screaming Frog or Sitebulb?",
        a: "Generic crawlers report on technical SEO — broken links, missing alt text, redirect chains. They are also paid: Screaming Frog runs £199/yr, Sitebulb $35/mo, Ahrefs Site Audit $129/mo. pseolint is free and MIT-licensed. The SpamBrain checker only reports on signals that look like they map to spam classification: thin content thresholds (default 300-word floor), near-duplicate templates above 85% SimHash similarity, doorway patterns, AI-generated boilerplate above an 80% ratio, internal link cliques, third-party content abuse. It's a much narrower, more opinionated lens.",
      },
      {
        q: "What if my site has 200,000 pages and you only audit 50?",
        a: "The 50-page sample is weighted to oversample templated URL patterns, so you'll usually see your worst clusters even on huge sites. That said, sampling is lossy — a single bad template that lives in a tiny corner of the sitemap can be missed. If you need full coverage, the Pro plan audits up to 500 pages per run and supports scheduled monitoring.",
      },
      {
        q: "Does this catch sites hit by the March 2024 scaled content abuse update?",
        a: "It catches the structural patterns that update was designed to demote — pages that read like reusable templates with one variable swapped per page, large-scale AI generation without unique research, and content farms that publish more than they could plausibly fact-check. We don't directly query whether a domain is currently demoted (that data isn't public) but the signals overlap heavily with what the update penalized.",
      },
      {
        q: "Is the rule engine open source?",
        a: "Yes. The full rule set lives at github.com/ouranos-labs/pseolint under the MIT license as the @pseolint/core package — you can run it locally with the CLI (`npm i -g pseolint`), audit your CI builds, or fork the rules. The hosted checker on this page is the same engine wrapped in a sampler and a UI.",
      },
    ],
    related: ["thin-content-scanner", "doorway-page-detector"],
  },
  {
    slug: "thin-content-scanner",
    title: "Thin content checker — find pages Google sees as filler",
    metaDescription:
      "Free thin-content scanner for pSEO sites. Identify under-substance pages, AI boilerplate, and templated filler before they drag your whole domain into the algorithm's bad books.",
    shortPitch:
      "Find every page on your site that Google might classify as thin — under-substance, templated, or AI-padded — in one 60-second crawl.",
    primaryKeyword: "thin content checker",
    ruleLens: "spam/thin-content",
    what:
      `The thin-content scanner samples your sitemap, fetches up to 200 pages on the free tier (up to 500 on Pro manual re-audits at $19/month), and grades each against the substance heuristics SpamBrain appears to use: visible word count against pseolint's 300-word floor (configurable per archetype), lexical uniqueness compared to sibling pages, presence of original media or sourced data, and the ratio of unique to recycled phrasing. The check runs in a 60-second median window and is powered by @pseolint/core v${ENGINE_VERSION} (MIT-licensed at github.com/ouranos-labs/pseolint). It produces a per-page substance score plus a domain-wide breakdown of how much of your indexable surface area is below the practical threshold where Google starts ignoring or demoting pages.`,
    why:
      "Thin content is the oldest cause of pSEO failure and the one most operators still get wrong. Helpful Content updates in 2022 and 2023 made it a ranking factor; the March 5, 2024 scaled content abuse update (https://developers.google.com/search/docs/essentials/spam-policies) made it a policy violation, and the May 7, 2024 site reputation policy extended that to third-party content on parasite subdomains. The cost has changed too — historically a thin page just didn't rank. Today, a critical mass of thin pages can pull your entire domain's quality signal down, which means your good pages stop ranking too. The pseolint scanner uses a 300-word default floor (configurable per archetype) and weights findings as info=5, warning=12, error=25 in the overall score. If your site has a long tail of auto-generated location pages, AI-spun product variants, or templated comparison articles, the question is no longer whether some are thin — it's whether enough of them are thin to taint the rest.",
    howItWorks: [
      "Sample up to 200 URLs from your sitemap on the free tier (500 on Pro at $19/month), with extra weight given to URL patterns that look mass-generated. Median crawl + audit time is 60 seconds.",
      "For each page, strip nav, footer, and template chrome to isolate the actual unique main content.",
      "Score each page on visible word count (post-strip), lexical diversity, sentence-level uniqueness vs sibling pages, and presence of structured data, media, or citations. The default error threshold fires below 250 words and warns under 300.",
      "Cross-compare pages within the same URL pattern using 64-bit SimHash fingerprints — pages clustering at a Hamming distance of 8 or less are flagged as near-duplicate, and pages with Jaccard shingle overlap above 85% are escalated as templated boilerplate.",
      "Surface the worst offenders first, with a substance score and a one-line diagnosis (under-length, near-duplicate, AI-padded, no unique research). The infrastructure runs on Next.js 15 with Inngest-backed background crawls so audits stay snappy even on a 500-URL Pro run.",
    ],
    whatYouGet: [
      "A list of every audited page sorted by substance score, worst first.",
      "A domain-level percentage: what share of your sampled surface area is below the practical thin-content threshold.",
      "Near-duplicate clusters — groups of pages that share so much copy that Google likely canonicalizes them or drops most of the cluster.",
      "Word-count distribution chart so you can see whether thin pages are a long tail or a clustered template problem.",
      "Specific recommendations per page — whether to expand, merge, redirect, or noindex.",
    ],
    faqs: [
      {
        q: "What word count counts as thin content?",
        a: "There is no fixed Google threshold and anyone who tells you 300 words is the line is making it up. What matters is substance relative to user intent. A definitions glossary entry can rank fine at 80 words; a buyer's guide at 800 words can be thin if it's all generic platitudes. The pseolint default is a 300-word floor that you can tune per archetype (200 for product comparators, 350 for guide-style hubs). Our scanner weighs word count alongside lexical uniqueness, originality, and sibling-page comparison — so a 200-word page with a unique data point beats a 1,500-word page of recycled boilerplate.",
      },
      {
        q: "How do you handle pages with lots of dynamic content like product listings?",
        a: "We treat structured listings (tables, product cards, schema-marked items) as substance, since they typically represent real, queryable data. The scanner downgrades pages where the only variation between siblings is a swapped variable inside otherwise identical prose — that's the pattern SpamBrain seems to weight most heavily.",
      },
      {
        q: "Can the scanner tell if my content is AI-generated?",
        a: "Indirectly. We don't run an AI-detection classifier (those are unreliable) but we flag the structural fingerprints that AI-spun content tends to leave: uniform paragraph length, generic transitional phrases, low entity density, no first-person voice or sourced claims. Google has been clear that AI-generated content is fine if it's helpful — the March 5, 2024 scaled-content-abuse policy explicitly targets unhelpful AI content rather than AI itself. The scanner finds the unhelpful kind, and pairs cleanly with the dedicated aeo/* rules pseolint ships for AI-answer-engine grounding.",
      },
      {
        q: "What's the fix for a page flagged as thin?",
        a: "There are four options and the right one depends on the page. Expand: add a unique data point, original quote, or genuine user-relevant detail. Merge: consolidate three near-duplicate pages into one strong canonical. Redirect: 301 to the closest substantive page. Noindex: keep it accessible to users but remove it from Google's view. Each finding suggests one of these based on the failure mode.",
      },
      {
        q: "Will fixing thin pages immediately recover lost rankings?",
        a: "Usually no — recovery from a quality-signal hit takes 30-day to 90-day windows in our observed cases, because Google needs time to re-crawl and re-evaluate the affected pages. The March 2024 Core Update rollout itself took 45 days to fully propagate. Fixing thin content is necessary but not sufficient: you also need Google to recrawl, re-render, and re-score, which is why you should pair content fixes with a sitemap resubmit and a few high-quality external links pointing at the recovered pages. Compared to paid alternatives like Ahrefs Site Audit at $129/month or Semrush at $139.95/month, the pseolint scanner is free for the substance check and $19/month for monitoring.",
      },
    ],
    related: ["spambrain-checker", "doorway-page-detector"],
  },
  {
    slug: "doorway-page-detector",
    title: "Doorway pages checker for programmatic SEO",
    metaDescription:
      "Free doorway-page detector. Find templated location, service, or modifier pages on your site that Google's doorway policy targets — before they get demoted or deindexed.",
    shortPitch:
      "Spot doorway-shaped clusters on your site — repeated templates with one variable swapped — that Google's doorway policy explicitly targets.",
    primaryKeyword: "doorway pages checker",
    ruleLens: "spam/doorway-pattern",
    what:
      `The doorway-page detector identifies clusters of pages on your site that match the structural definition Google uses in its doorway policy (https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages): pages that exist primarily to rank for query variants and funnel users to the same destination, distinguished only by a swapped city, service modifier, or product noun. It crawls your sitemap (up to 200 pages free, up to 500 on Pro manual re-audits at $19/month), groups URLs by template, and compares the actual rendered content within each cluster using SimHash 64-bit signatures with a 0.85 near-duplicate threshold plus an entity-swap detector. The 60-second median run is powered by the MIT-licensed pseolint engine v${ENGINE_VERSION}. You get a list of doorway-shaped clusters ranked by risk, with the option to see exactly which pages would survive a doorway-policy enforcement and which wouldn't.`,
    why:
      "Google's doorway pages policy (https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages) was formalised in a March 16, 2015 Search Central post and has been on the books ever since. Enforcement accelerated sharply after SpamBrain was rebuilt on August 25, 2022 (the original classifier shipped in 2018) and then again after the March 5, 2024 scaled-content-abuse update extended doorway-style demotions to AI-spun funnels. The May 7, 2024 site-reputation-abuse policy then went after parasite hosting on otherwise reputable domains — high-profile manual actions hit subdomains operated by major media companies and affiliate networks within the first 30-day enforcement window. Manual actions for doorway pages are rare — what happens instead is algorithmic demotion of the entire cluster, sometimes the entire site, with no notification, and recovery typically takes a 90-day re-crawl window. Programmatic SEO is particularly exposed because the same cost-saving template that lets you ship 50,000 pages overnight is also the structural fingerprint the policy was written to demote. The detector exists to draw the line between programmatic-but-substantive (a template that genuinely varies useful information per page) and programmatic-but-doorway (a template where the only variation is the keyword you're trying to rank for).",
    howItWorks: [
      "Discover URL templates by clustering your sitemap on path-segment patterns (e.g. /plumbers/[city] becomes one cluster).",
      "Sample representative pages from each cluster — both the largest clusters and the most templated-looking ones.",
      "Strip template chrome and diff the unique main content between sibling pages within each cluster.",
      "Score each cluster on a doorway-risk axis using the same 3-signal stack (near-duplicate at 85% SimHash similarity + entity-swap detector + identical structureSignature/meta) that pseolint's spam/doorway-pattern rule requires before firing at error severity (weight 25).",
      "Cross-check internal linking — doorway clusters typically link only to themselves and a single conversion destination, which is itself a strong signal.",
    ],
    whatYouGet: [
      "A list of every URL cluster on your site, ranked by doorway risk score.",
      "Per-cluster detail: page count, content-diversity percentage, conversion-destination overlap, sample diffs between sibling pages.",
      "A flag for clusters that are explicitly named in Google's doorway policy examples (location pages with no localized content, near-duplicate service pages, intermediate funnel pages).",
      "A recommendation per cluster: keep as-is, deepen content, consolidate to a single canonical, or sunset.",
      "Internal-link map showing how doorway clusters relate to the rest of your site (often a useful clue for what to keep vs cut).",
    ],
    faqs: [
      {
        q: "What makes a page a doorway page in Google's eyes?",
        a: "Google's doorway policy (https://developers.google.com/search/docs/essentials/spam-policies#doorway-pages) describes them as pages designed to rank for similar queries that funnel users to the same destination, with the variations between them being keyword-driven rather than user-driven. The clearest examples are city pages for a national service business where the only differences between /plumbers/austin and /plumbers/dallas are the city name and a stock photo. The policy also covers near-duplicate service-modifier pages (cheap, best, top, near-me variants) and intermediate funnel pages whose only purpose is to capture a SERP click and bounce users to the real conversion page. The policy was first published in March 2015 and last expanded in the May 7, 2024 site-reputation update.",
      },
      {
        q: "Are all programmatic location pages doorway pages?",
        a: "No. The policy explicitly distinguishes between doorway pages and useful templated pages. A pizza chain's /locations/[store] pages are not doorways if each page genuinely serves a local-intent user — store hours, address, phone, menu specifics, real photos. The detector grades on whether the variation between sibling pages is substantive enough to justify the page existing, or whether it's purely keyword-targeting with cosmetic differences.",
      },
      {
        q: "Can I have some doorway pages and not get penalized?",
        a: "Possibly, depending on scale and intent. Google's enforcement seems to be tolerant of small numbers of borderline pages on otherwise high-quality sites and aggressive on sites where doorways are the dominant pattern. The risk threshold isn't published. The detector errs toward conservatism — flagging clusters that have the structural fingerprint, then letting you make the editorial call on whether they're worth defending or not.",
      },
      {
        q: "What's the difference between a doorway page and thin content?",
        a: "Thin content is about substance per page — does this single URL have enough unique value to deserve indexing. Doorway is about pattern across pages — does this cluster of URLs exist primarily to capture keyword variants rather than serve distinct user needs. A page can be thin without being doorway (a single under-researched blog post) and doorway without being individually thin (a 2,000-word city page that says nothing genuinely local). The detector handles the doorway side; the thin-content scanner handles the page-level substance side.",
      },
      {
        q: "If I have a doorway cluster, what's the fastest fix?",
        a: "The fastest fix is usually consolidation: pick the strongest representative page in the cluster, expand it to cover the whole topic, and 301 the rest to it. This preserves the link equity, removes the doorway pattern, and lets Google re-evaluate the consolidated page on its own merits over a typical 30-day to 60-day recrawl window. The slower but higher-ceiling fix is to deepen each page into something genuinely user-distinct — but if you can't credibly do that across 1,000 city pages, consolidation is the safer bet. Compared to running this analysis manually in Screaming Frog (£199/year) or Sitebulb ($35/month), the pseolint detector is free for one-shot audits and $19/month for scheduled monitoring across multiple domains.",
      },
    ],
    related: ["spambrain-checker", "thin-content-scanner"],
  },
];

/** Merge per-slug authoritative sources onto each base entry. */
export const MARKETING_TOOLS: readonly MarketingTool[] = TOOLS_BASE.map((entry) => ({
  ...entry,
  sources: TOOL_SOURCES[entry.slug] ?? [],
  extra: TOOL_EXTRA[entry.slug] ?? [],
}));

/** O(1)-ish lookup since the array is tiny. Returns undefined for unknown slugs. */
export function getMarketingTool(slug: string): MarketingTool | undefined {
  return MARKETING_TOOLS.find((t) => t.slug === slug);
}
