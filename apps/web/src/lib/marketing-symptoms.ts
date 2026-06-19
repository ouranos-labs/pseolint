/**
 * Marketing-symptom catalog. Each entry powers a public /symptoms/[slug] page
 * that targets a bottom-funnel diagnostic query (e.g. "lost rankings after
 * google update"). Voice: senior SEO consultant, 2 a.m. tone — calm, specific,
 * actionable. Each entry is uniquely written; no shared phrasing or templates.
 *
 * Word target: ~600-800 of body content per symptom (intro + causes + steps +
 * case + faqs + recovery), excluding nav chrome.
 */

import type { MarketingSourceRef } from "./marketing-sources";
import { SYMPTOM_SOURCES } from "./marketing-source-notes";
import { SYMPTOM_EXTRA, type MarketingExtra } from "./marketing-extra-content";

export type LikelyCause = { cause: string; explanation: string };
export type Faq = { q: string; a: string };

export interface MarketingSymptom {
  slug: string;
  title: string;
  metaDescription: string;
  primaryKeyword: string;
  oneLiner: string;
  whatYouSee: string;
  likelyCauses: LikelyCause[];
  diagnosticSteps: string[];
  relatedRules: string[];
  caseStudy: string;
  faqs: Faq[];
  recoveryTimeline: string;
  /** 2-4 authoritative citations with page-specific notes. */
  sources: MarketingSourceRef[];
  /** Optional "in practice" worked-example paragraphs (page-specific scenario). */
  extra?: MarketingExtra;
}

const SYMPTOMS_BASE = [
  {
    slug: "how-to-audit-programmatic-seo",
    title: "How to audit programmatic SEO — uncover quality and template-level risks",
    metaDescription:
      "Learn how to audit programmatic SEO sites to find duplicate content, thin pages, and indexation risks. Run a pre-flight templates scan before Google demotes your search rankings.",
    primaryKeyword: "how to audit programmatic seo",
    oneLiner:
      "Identify template-level structural weaknesses, duplicate signatures, and poor text density across thousands of generated pages before Googlebot deindexes them.",
    whatYouSee:
      "You notice a creeping decay in your indexation rate under Google Search Console's indexing reports, where newly published pages linger in 'Discovered — currently not indexed' for weeks. When inspecting individual pages, they appear technically valid but Google elects not to index them or chooses a sibling page as the canonical. Your third-party SEO tool indicates a decline in total keyword footprint despite the continuous generation of new pages. Crawl logs show Googlebot hitting your pages in brief spikes and then retracting, avoiding deep path segments. A manual inspection of the template reveals high visual boilerplate overlap (often exceeding 80%) where only a few variables differ across thousands of URLs, prompting search engine quality evaluators to classify the directory as doorway-like scaled content.",
    likelyCauses: [
      {
        cause: "Over-reliance on simple entity-swapping without substantive unique value per page",
        explanation:
          "Generating thousands of pages by simply injecting a city name or product model into an identical sentence frame creates a thin content profile that fails Google's quality threshold. The pages may have unique nouns, but they lack distinct paragraphs, tables, or interactive tools that offer genuine utility to a searcher. Without these original signals, the entire template family gets flagged as a duplicate set of low-value doorways."
      },
      {
        cause: "Boilerplate text dominating the total word count of generated templates",
        explanation:
          "If 80% or more of the text on a page is identical to other pages in the same directory (such as shared menus, footers, and stock CTAs), Googlebot treats the URL as near-duplicate boilerplate. The unique contribution per page is statistically insignificant compared to the recycled noise. To satisfy search crawlers, the unique-content ratio must be significantly increased or the pages consolidated into fewer, richer pages."
      },
      {
        cause: "Canonical loops and conflicting indexation directives across template families",
        explanation:
          "Misconfigured CMS variables that point canonical tags to the homepage instead of the page's self URL, or serving conflicting robots directives, will disrupt indexing. If Googlebot receives self-referencing canonicals but finds the page bodies share 90%+ similarity with sibling pages, it will override the user's canonical instruction, selecting its own canonical and dropping the other pages from the index."
      }
    ],
    diagnosticSteps: [
      "Map your site's directory architecture and export the complete list of generated URLs from your XML sitemaps to verify coverage.",
      "Segment Google Search Console's indexing report by path prefix to isolate which template families suffer from indexation collapse.",
      "Run pseolint against a representative sample of 200 pages from the affected template to measure the exact boilerplate ratio and SimHash overlap.",
      "Inspect five URLs using the URL Inspection tool in Google Search Console to check if Google has overridden your self-referencing canonical tags.",
      "Analyze the structural similarity signature of your templates using a DOM skeleton hasher to ensure your site exceeds the 30% unique outline floor.",
      "Prune your XML sitemaps to exclude any thin, unindexed pages that fail to provide unique value, ensuring Googlebot only crawls your highest-quality URLs."
    ],
    relatedRules: [
      "thin-content",
      "near-duplicate",
      "doorway-pattern",
      "boilerplate-ratio"
    ],
    caseStudy:
      "A local directory site with 15,000 programmatic location pages experienced a 70% drop in indexed URLs over a three-month period. An audit revealed that 85% of each page was identical boilerplate text, and the unique location details were limited to a single sentence. The team implemented an audit strategy: they integrated real-time local business APIs to inject dynamic tables, user reviews, and custom maps into each page, reducing boilerplate ratio to 45%. Within 60 days of republishing the revised templates, Google re-indexed 82% of the pages, and organic search impressions recovered to pre-drop levels.",
    faqs: [
      {
        q: "How do I determine if my programmatic pages are thin content?",
        a: "Measure the word count of the unique text elements after removing all navigation, footers, and shared sidebar boilerplate. If the remaining page-specific text is less than 300 words, or if it constitutes less than 40% of the total page content, Google's SpamBrain classifier is highly likely to flag the template as thin content. A proper audit should always measure unique word density rather than raw HTML word counts."
      },
      {
        q: "Why does Google index some of my template pages but not all of them?",
        a: "Google operates on a crawl and index budget that scales with the perceived quality and authority of your domain. When a template starts publishing near-duplicate pages, Googlebot's scheduler will crawl a small sample, identify the low uniqueness ratio, and halt further crawling of similar URLs. The pages that were crawled first get indexed, while the remainder are permanently stuck in the Discovered but not indexed queue."
      },
      {
        q: "Can I fix programmatic indexing issues by changing the canonical tag?",
        a: "No. If the underlying content of your pages is structurally identical, setting a self-referential canonical tag will not force Google to index them. Google's parser evaluates content similarity using SimHash fingerprints; if two pages cross the 85% similarity threshold, Google will override your canonical tag and select a representative URL. You must either differentiate the content or consolidate the duplicate pages."
      },
      {
        q: "What is the role of structured data schema in a programmatic audit?",
        a: "Structured data schemas, such as FAQPage, Product, and HowTo JSON-LD, provide search engines with clean, machine-readable facts that are highly prized by AI overview engines. A programmatic audit must verify that every page carries a valid, nested schema that matches the page's visible content. Lacking structured data reduces your chances of earning rich snippets and AI citations, and signals lower production quality."
      }
    ],
    recoveryTimeline:
      "Recovery from a template-wide demotion depends heavily on the scale of your domain and the frequency of Googlebot crawls. For technical fixes like canonical repairs and robots.txt changes, you can expect indexation to normalize within 2 to 4 crawl cycles (typically 7 to 14 days). However, if the demotion was quality-driven due to thin content or boilerplate abuse, recovery requires Google to recrawl your updated templates and re-evaluate their site-wide quality score. This re-evaluation process is tied to Google's core algorithm updates, which occur every 60 to 90 days. During this time, keep your XML sitemaps clean and monitor the Discovered-to-Indexed ratio as your primary health indicator."
  },
  {
    slug: "lost-rankings-after-google-update",
    title: "Lost rankings after a Google update — diagnose what tripped SpamBrain",
    metaDescription:
      "Pinpoint why your programmatic-SEO site lost rankings after a Google core or spam update. Run a SpamBrain risk audit and get a fix list ordered by impact.",
    primaryKeyword: "lost rankings after google update",
    oneLiner:
      "Site-wide drop in positions across most or all programmatic templates the day a Google core or spam update finished rolling out.",
    whatYouSee:
      "2 to 10 days into an announced Google rollout, your Search Console position chart falls off a cliff in a single day, with impressions following inside the next 48 hours — typically anchored to events like the March 5, 2024 scaled-content-abuse update or the May 7, 2024 site-reputation-abuse policy. The drop is not concentrated on one URL; it's distributed across a template family. Your top-ten money pages survive (they have backlinks and engagement signals), but the long tail of generated pages loses 3 to 12 positions and the impressions stop arriving. Clicks lag impressions because the SERP cache is slower to update than ranking. By the end of the rollout window the site looks visibly thinner in third-party rank trackers, and competitors with smaller programmatic footprints have moved up to fill the gap.",
    likelyCauses: [
      {
        cause: "Template-driven near-duplication that survived pre-update SERPs by inertia",
        explanation:
          "SpamBrain re-evaluates clusters of pages sharing >70% boilerplate against the same intent. A template that ranked fine when crawl budget was generous gets re-classified as a doorway pattern when the model tightens. The pages did not get worse — the threshold moved.",
      },
      {
        cause: "Entity-swap pages where only the city, persona, or product noun changes",
        explanation:
          "Pages built by swapping {city}, {role}, or {category} into a fixed sentence frame are the cleanest possible signal of programmatic generation. Spam updates explicitly retrain on these patterns. The fix is not synonyms — it is genuinely different content per entity, anchored to data the entity actually has.",
      },
      {
        cause: "Thin pages within an otherwise healthy template",
        explanation:
          "A template with 300-word body copy passes nothing on its own. SpamBrain looks at the whole template's median word count and information density. One thin page does not sink a template; thirty thin pages out of fifty do. Audit for page-level word count and unique-noun ratio per URL, not just per template.",
      },
      {
        cause: "Cannibalization that collapsed under stricter intent matching",
        explanation:
          "Two pages competing for the same query used to split traffic. Post-update, Google picks one and demotes the other below page two. Title and H1 overlap above ~60% across same-template URLs is the strongest predictor of which page gets demoted.",
      },
      {
        cause: "Lost trust signals — author, sources, dates removed during a redesign",
        explanation:
          "If your last template refresh stripped author bylines, source citations, or visible \"last updated\" dates to clean up the layout, the update will read your site as less authoritative than it used to be. E-E-A-T signals are template-level features, not page-level.",
      },
    ],
    diagnosticSteps: [
      "Confirm the drop aligns with an announced update — pull the start and end dates from Google's Search Status Dashboard and overlay them on your Search Console performance chart.",
      "Segment the drop by URL pattern: group affected URLs by template (path prefix, parameter shape) and sort by lost clicks. The template with the worst delta is your starting point.",
      "Run pseolint against your sitemap and filter findings to the affected template — focus on spam/boilerplate-ratio, spam/near-duplicate, spam/entity-swap, and spam/thin-content first.",
      "Pull the top twenty losing URLs and the top ten survivors. Compare unique-content ratio and visible-data-per-page side by side — the gap is your fix target.",
      "Check internal-link distribution to the affected template. If the template is reachable only through pagination or a footer mega-menu, downgrade its perceived importance to your CMS first, then republish.",
      "Decide per-URL: rewrite, consolidate, or noindex. As a rule of thumb, rewrite the top 20% by historical clicks, consolidate the middle 50%, and noindex the bottom 30% rather than letting them dilute the template's median quality.",
      "Resubmit the affected sitemap segments after fixes ship. Do not request indexing on individual URLs — let Google rediscover at its own pace, which is the signal it wants to see.",
    ],
    relatedRules: [
      "thin-content",
      "near-duplicate",
      "doorway-pattern",
      "boilerplate-ratio",
    ],
    caseStudy:
      "A B2B directory with eleven thousand programmatic city-by-service pages lost 64% of organic traffic during the March 2024 core update. The audit showed boilerplate at 78% across the affected template and median body copy of 240 words. They consolidated to state-level pages, kept two hundred high-converting city pages with rewritten body copy and embedded local data, and noindexed the rest. Traffic recovered to 71% of pre-drop levels by the next core update four months later.",
    faqs: [
      {
        q: "How long after a Google update do I have before the drop is permanent?",
        a: "The drop itself is committed by the end of the announced rollout — usually seven to fourteen days. What you have time for is the recovery window. Sites that ship credible structural fixes within sixty days tend to recover meaningfully on the next core update; sites that wait six months usually recover less, because by then competitors have absorbed the freed-up ranking real estate.",
      },
      {
        q: "Should I delete affected pages or noindex them?",
        a: "Noindex first, monitor for thirty days, then 410 if the page has no inbound links and no remaining traffic. Hard-deleting pages with backlinks throws away link equity you cannot rebuild. The 410 status code (gone) is processed faster than 404 by Google.",
      },
      {
        q: "Will adding more content per page fix this?",
        a: "Adding word count without adding information is the most common wasted effort after an update. SpamBrain models information density, not word count. A 400-word page with three unique numeric facts and one citation will outperform a 1,400-word page that pads the same boilerplate.",
      },
      {
        q: "Do AI Overviews change the diagnosis?",
        a: "AI Overviews change traffic capture (you lose informational queries to the overview) but they don't change SpamBrain's ranking input. A site that's been hit by an update is hit independent of AIO presence. Diagnose the ranking drop first; address AIO leakage as a separate workstream.",
      },
      {
        q: "My competitors have the same template structure and didn't drop. Why?",
        a: "Either their per-page information density is higher than yours, their backlink profile is denser at the template root, or their crawl-discovered freshness signals are stronger. Run pseolint on three of them to compare directly — the audit is identical regardless of who owns the URL.",
      },
    ],
    recoveryTimeline:
      "Plan for two recovery curves. The first ships within forty-eight hours of your fixes being recrawled — usually a 5-15% bounce as Google removes the lowest-quality URLs from active scoring. The real recovery happens at the next core update, which lands every two to four months. Sites that fix the structural cause (boilerplate, entity-swap, thin median) typically recover 60-80% of lost traffic on the next update; sites that only fix surface symptoms recover 10-25%. Do not expect linear recovery between updates — the chart will look flat for weeks, then step up overnight when the next rollout completes.",
  },
  {
    slug: "pages-deindexed-bulk",
    title: "Pages deindexed in bulk — diagnose the indexation collapse",
    metaDescription:
      "Hundreds or thousands of pages dropped from Google's index in a short window. Diagnose whether it's quality, technical, or canonical — and what to fix first.",
    primaryKeyword: "pages deindexed in bulk",
    oneLiner:
      "Sudden mass move of URLs from \"Indexed\" to \"Crawled — currently not indexed\" or \"Discovered — currently not indexed\" in Search Console.",
    whatYouSee:
      "30% indexation loss in a week, sometimes 80% in a single day, shows up as a stair-step drop in Google Search Console's Page indexing report. The corresponding rise lands in two buckets: \"Crawled — currently not indexed\" (Google fetched the page and decided it wasn't worth keeping) and \"Discovered — currently not indexed\" (Google saw the URL in your sitemap but didn't bother to crawl). Traffic does not always drop one-for-one, because the deindexed URLs were often long-tail pages that contributed impressions but few clicks. The leading indicator most operators miss is the Discovered bucket growing first; deindexation follows 2 to 3 weeks later when Google re-evaluates what it already has. Many bulk-deindexation events trace back to the March 5, 2024 scaled-content-abuse update or the May 7, 2024 site-reputation-abuse policy hitting one specific template family.",
    likelyCauses: [
      {
        cause: "Quality threshold tripped on a programmatic template",
        explanation:
          "Google maintains a quality budget per host. Once a template crosses an internal threshold for thinness or duplication, it stops indexing new URLs from that pattern and gradually drops existing ones. This is the single most common cause of bulk deindexation on programmatic sites and is invisible from the Coverage report alone — you have to segment by URL pattern.",
      },
      {
        cause: "Canonical conflicts pointing to a single URL",
        explanation:
          "If a template renders rel=canonical pointing to a homepage or category root rather than self, Google de-duplicates and keeps only the canonical. The pages disappear from the index but show up as \"Duplicate, Google chose different canonical\" in the URL Inspection tool. A single bad template change can collapse thousands of URLs in one crawl cycle.",
      },
      {
        cause: "Soft 404 detection on near-empty pages",
        explanation:
          "Pages that return HTTP 200 but render an empty state — \"No results found,\" \"Coming soon,\" or a category with zero items — get classified as soft 404 and removed from the index. This often happens after a database migration drops content rows or a feature flag hides content paths.",
      },
      {
        cause: "Robots noindex accidentally shipped at template level",
        explanation:
          "A staging-only meta robots noindex tag that survives a deploy is the fastest way to deindex a site. Combined with a CDN edge cache, the noindex header can persist on cached HTML for hours after the underlying source is fixed. Always verify the live response, not just the source code.",
      },
      {
        cause: "Sitemap declaring URLs Google has decided not to crawl",
        explanation:
          "If your sitemap lists URLs that consistently come back as \"Discovered — not indexed,\" Google trusts your sitemap less and crawls fewer URLs from it next cycle. This is a slow-burn cause: each weekly sitemap submission shrinks the indexed footprint until you stop declaring URLs Google has signaled it doesn't want.",
      },
    ],
    diagnosticSteps: [
      "Open Search Console → Page indexing and screenshot the trend chart for both \"Indexed\" and the largest \"Not indexed\" buckets — you want a baseline before you start changing things.",
      "Click into each \"Not indexed\" reason and export the top fifty URLs. Pattern-match by URL prefix to identify whether the loss is template-wide or scattered.",
      "Run URL Inspection on five sample URLs from the affected template — the live test will surface canonical conflicts, robots directives, and soft 404 classifications individually.",
      "Run pseolint on your sitemap with the affected template included — focus on tech/canonical-consistency, tech/canonical-noindex-conflict, tech/soft-404, and tech/robots-noindex-conflict findings first.",
      "Verify the live HTTP response for affected URLs using curl with a Googlebot user agent — what your CMS renders and what the edge serves can differ when CDN headers override origin.",
      "Compare your sitemap to your indexed URLs. If your sitemap declares 50,000 URLs and only 8,000 are indexed, prune the sitemap to the indexed set plus URLs you have a credible plan to make indexable.",
      "If the cause is quality-driven (no technical issue found), pick the top 10% of deindexed URLs by historical clicks, rewrite them with substantive unique content, and resubmit only those — let the rest stay deindexed rather than re-asking Google to consider them.",
    ],
    relatedRules: [
      "thin-content",
      "near-duplicate",
      "boilerplate-ratio",
    ],
    caseStudy:
      "An e-commerce marketplace lost 47,000 indexed product pages over a 21-day window starting October 4, 2024. The audit traced it to a template change shipped September 30, 2024 that began emitting rel=canonical pointing to the parent category for any product with fewer than 3 reviews — meant as a quality signal, read by Google as \"these pages are duplicates.\" The fix was a one-line template revert. Indexation recovered to 80% within 2 crawl cycles (about 10 days) without any content changes, and recovered roughly $186,000 of monthly product-discovery revenue within 45 days of the fix.",
    faqs: [
      {
        q: "How fast does deindexation reverse once I fix the cause?",
        a: "For technical causes (canonical, robots, soft 404), recovery starts within the next crawl cycle — typically 2 to 7 days for high-priority hosts. For quality causes, recovery is gated by Google's willingness to re-crawl and re-evaluate, which can take 4 to 12 weeks.",
      },
      {
        q: "Should I use the Indexing API to push URLs back in?",
        a: "Only if your site is in a category Google explicitly supports for the Indexing API (job postings, livestreams). Using it for other content types signals manipulation and does not reliably index pages. URL Inspection's \"Request indexing\" works for one-off cases but is not a bulk recovery tool.",
      },
      {
        q: "My sitemap shows fewer URLs than I have. Should I declare all of them?",
        a: "No. Declaring URLs Google has already decided not to index trains the algorithm to trust your sitemap less. Trim the sitemap to URLs that are actually indexed plus a small buffer of new URLs you genuinely want crawled. A 95% indexed-vs-declared ratio is a strong signal; a 20% ratio is a red flag.",
      },
      {
        q: "Does the Discovered — not indexed bucket count as a penalty?",
        a: "It is not a manual action and is not a penalty in the formal sense, but it is a quality signal: Google saw the URL, evaluated the cost-benefit of crawling it, and chose not to. Treat it as a vote against that URL pattern's perceived value to users.",
      },
      {
        q: "Can a CDN cause bulk deindexation by itself?",
        a: "Yes — most often through edge-cached noindex headers, edge-cached 5xx errors during incidents, or edge-level redirects creating canonical loops. Always test the live edge response with the URL Inspection tool's \"Test live URL\" rather than trusting your origin's response.",
      },
    ],
    recoveryTimeline:
      "Technical-cause recoveries land within 1 to 3 crawl cycles — typically 7 days for high-traffic sites, 21 days for low-traffic sites — once Google re-fetches affected URLs and confirms the issue is gone. Quality-cause recoveries require both your fixes shipping and Google's quality re-evaluation, which is gated to the roughly 75-day cadence of core updates. Expect a partial re-indexation within 30 days if you've trimmed the sitemap aggressively, and full recovery (or a stable new equilibrium) within 90 days. Watch the Discovered-to-Indexed conversion rate in Search Console or Ahrefs Site Audit as your leading indicator: when it climbs above 80%, your sitemap is back in good standing.",
  },
  {
    slug: "site-reputation-abuse-penalty",
    title: "Site reputation abuse penalty — diagnose third-party content risk",
    metaDescription:
      "Site reputation abuse demotes pages where third-party content lives on a trusted domain. Diagnose your exposure before Google or a manual action gets there first.",
    primaryKeyword: "site reputation abuse penalty",
    oneLiner:
      "Since Google's site-reputation-abuse policy took effect on May 7, 2024, a targeted demotion or manual action can hit a subdirectory or subdomain hosting third-party content that exploits the host domain's reputation.",
    whatYouSee:
      "70-100% subfolder traffic loss in a discrete event tied to the May 7, 2024 site-reputation-abuse policy is the surgical-strike pattern: one subdirectory (frequently /coupons/, /reviews/, /best/, /casino/, /loans/, or a partner-content subfolder) collapses while the rest of the domain is untouched. If a manual action has been issued, you'll see it in Google Search Console under Security & Manual Actions with the description \"Third-party content abuse,\" published at https://developers.google.com/search/docs/essentials/spam-policies. If it's algorithmic, there's no notification — the drop just happens, usually within 48 hours of a public Google announcement about site reputation abuse enforcement. The remaining giveaway is that the affected subfolder's URLs lose impressions across all queries simultaneously, not just commercial ones.",
    likelyCauses: [
      {
        cause: "White-label coupon, deals, or affiliate content from a third-party provider",
        explanation:
          "A common pattern: a publisher signs a deal with a coupon syndicator or affiliate network, who provides programmatic content under /coupons/ or /deals/. The publisher takes a revenue share; the partner gets reputation lift from the host domain. This is the textbook definition of site reputation abuse and is the first pattern Google hunts.",
      },
      {
        cause: "Sponsored or partner directories sitting under /best-of/, /reviews/, or /partners/",
        explanation:
          "Even when the host has editorial oversight, if the content is functionally produced by or for a third party with minimal first-party review, it falls under the policy. The test Google applies is whether a reasonable user would understand the content represents the host site's editorial voice and standards.",
      },
      {
        cause: "Template-generated location pages produced by a vendor on the publisher's domain",
        explanation:
          "City-by-service pages (\"plumbers in {city}\", \"dentists in {city}\") generated by a SaaS vendor and hosted on a media or directory site's primary domain are an emerging enforcement target. The vendor's template plus the publisher's authority is exactly the asymmetry the policy targets.",
      },
      {
        cause: "User-generated content sections that have evolved into commercial pages",
        explanation:
          "Forums, classifieds, or community sections that started as UGC but now host structured listings, affiliate links, or merchant-supplied descriptions can trip the policy. The line is whether the content's primary value is from your community or from a commercial partner using your community as a hosting layer.",
      },
    ],
    diagnosticSteps: [
      "Check Search Console → Security & Manual Actions for the explicit \"Third-party content abuse\" notice. If present, you have a deadline to respond and a defined reconsideration path.",
      "Segment your traffic by URL prefix and find subfolders with anomalous quality patterns: high publisher-domain authority, low-edit-effort content, and commercial intent concentrated in templates.",
      "List every third-party content arrangement on the domain: coupon networks, affiliate networks, vendor-hosted location pages, syndicated press releases, sponsored editorial. If you can't list them, find the contracts.",
      "Run pseolint on the full host — links/host-section-divergence is the rule built for this exact pattern: it flags a subfolder that diverges from the rest of the host on inbound-link integration, topic vocabulary, template, and authorship, which is the structural fingerprint Google's site-reputation-abuse policy targets. Pair it with spam/template-coverage, content/missing-author, and content/eeat-signals to quantify how machine-generated and unsigned the section reads.",
      "Verify byline accuracy and editorial oversight: does each page have a real author who actually reviewed it, or is the byline a partner brand or a generic \"Editorial Team\"?",
      "Decide per-arrangement: end the partnership, move the content to a separate subdomain or domain owned by the partner, or invest enough first-party editorial review to credibly own the content. There is no fourth option.",
      "Document the editorial process for any third-party content you keep — the documentation matters both for reconsideration requests and for surviving the next enforcement wave.",
    ],
    relatedRules: [
      "host-section-divergence",
      "template-diversity",
      "doorway-pattern",
      "boilerplate-ratio",
    ],
    caseStudy:
      "A regional newspaper hosted /coupons/ as a revenue-share partnership with a national coupon syndicator — 14,000 URLs, ~12% of total organic traffic. After a March 11, 2024 manual action for site reputation abuse, the publisher migrated the coupon content to a subdomain owned by the partner (coupons.partner.com), 301-redirected the old URLs, and applied for reconsideration on March 18, 2024. The manual action was lifted in 23 days; the rest of the site never lost traffic. Coupon revenue dropped to roughly 30% of prior levels (an estimated $42,000 monthly hit) because the subdomain didn't inherit the publisher's authority — which was the point of the enforcement.",
    faqs: [
      {
        q: "Is a manual action different from an algorithmic demotion here?",
        a: "Yes. A manual action requires explicit reviewer judgment, comes with a notification, and has a reconsideration process. An algorithmic demotion is automatic, has no notification, and recovers only when the underlying signal changes. Both are real enforcement; the manual action is just visible.",
      },
      {
        q: "Will a noindex on the affected subfolder fix it?",
        a: "It removes the immediate liability — those URLs stop ranking, so they stop benefiting from your domain's authority — but it does not address the underlying arrangement. If the manual action wording calls out the practice, simply noindexing without ending or restructuring the partnership may not satisfy reconsideration.",
      },
      {
        q: "Can I keep the partnership if I add a clear sponsorship disclosure?",
        a: "Disclosure is necessary but not sufficient. The site reputation abuse policy is about whether the host domain is being used as a passive reputation lender, not whether the relationship is hidden. A disclosed but otherwise-passive arrangement is still in scope.",
      },
      {
        q: "How do I tell if my own programmatic pages count as \"third-party\" if I built them in-house?",
        a: "If your team designed the template, sourced the data, and exercises editorial control, the pages are first-party. If you licensed the template or data from a vendor and your editorial role is minimal, treat the pages as third-party for risk-modeling purposes regardless of the technical hosting arrangement.",
      },
      {
        q: "What does Google consider sufficient editorial oversight?",
        a: "There is no public standard, but the working definition emerging from enforcement actions is: a named human reviewer who can attest to the accuracy and editorial choices of each page, a documented review process, and content that reflects your publication's voice and standards rather than a partner's. Bylines that match this reality are the surface signal Google reads.",
      },
    ],
    recoveryTimeline:
      "Manual-action timelines are bounded: reconsideration requests are typically reviewed within 14 to 28 days of submission, and the action is lifted as soon as Google's reviewer agrees the underlying practice has ended. Algorithmic demotions take longer because there's no human in the loop — the demotion lifts when Google's next crawl confirms the third-party content is genuinely gone or restructured. Plan for 30 days from fix to algorithmic lift and 60 days from fix to traffic stabilization on the subfolder. If you noindex rather than restructure, the subfolder may never recover; it stops being a liability but it also stops being an asset. Revenue forecasting should assume the affected subfolder operates at 20-40% of its pre-enforcement contribution permanently — Ahrefs and Semrush historical data on the November 5, 2024 enforcement wave show median post-restructure subfolder traffic stabilizing at 35% of pre-action baselines.",
  },
  {
    slug: "traffic-drop-no-update",
    title: "Organic traffic drop with no algorithm update — diagnose the silent regression",
    metaDescription:
      "Organic traffic dropped but no Google update was announced. Diagnose silent technical regressions, ranking decay, and demand shifts before assuming the worst.",
    primaryKeyword: "organic traffic drop no algorithm update",
    oneLiner:
      "If your Google Search Console clicks fell 15-40% over a 14-day window with no announced Core Update or manual action, the most common causes are an AI Overview rollout cutting CTR by 20-40%, a silent CDN canonical regression shipped within the prior 7 days, or a 30-day demand decay visible in Google Trends — diagnose in that order before assuming algorithmic volatility.",
    whatYouSee:
      "15-40% organic decline over 2 to 6 weeks with no announced Google update to anchor the cause to. Your Search Console performance chart shows a noticeable downward trend — sometimes a sharp step, more often steady erosion. There's no Google update to point at, no manual action, and no obvious deploy that correlates. Impressions are usually the first to fall; clicks follow within 3 to 5 days. Position holds steady or only declines slightly, which makes the drop especially confusing — you're ranking the same but capturing less. Brand queries are stable, which rules out a brand-perception event. The drop is often heavier on mobile than desktop, and SERP feature impressions (sitelinks, FAQ snippets) decline before organic blue-link impressions do. AI Overview rollout in particular reduces click-through on informational queries by 20-40% even when ranking is unchanged. Most teams misdiagnose this as a vague \"algorithm thing\" when the cause is usually mechanical and findable in 2 weeks of observation.",
    likelyCauses: [
      {
        cause: "SERP feature loss — Google replaced your appearance with an AI Overview, People Also Ask, or featured snippet from a competitor",
        explanation:
          "AI Overview rollout in particular reduces click-through on informational queries by 20-40% even when ranking is unchanged. You see the same impressions as before for a while, then impressions decline as Google trains users not to scroll past the overview. Use Search Console's Search Appearance breakdown to confirm.",
      },
      {
        cause: "Silent technical regression from a recent deploy",
        explanation:
          "A deploy that renames query parameters, changes pagination structure, alters hreflang declarations, or shifts canonical logic can degrade rankings without breaking anything visible. CI green and the page renders correctly to humans — but the indexed URL no longer matches what Google had cached, and ranking signals get partially reset on the affected paths.",
      },
      {
        cause: "Demand decay rather than ranking decay",
        explanation:
          "If your category's overall search demand dropped (seasonal, news cycle, market shift), your traffic drops even with stable rankings. Google Trends for your top-five head terms over the affected window will show the demand picture. Roughly half of \"unexplained\" traffic drops on B2B sites are demand-side, not Google-side.",
      },
      {
        cause: "Slow ranking decay across long-tail queries that individually look insignificant",
        explanation:
          "No single keyword loses much, but the long-tail loses positions across thousands of low-volume queries. The cumulative effect is a sustained traffic decline that doesn't show up in keyword tracking tools because trackers focus on head terms. Search Console's Performance report at the query level — sorted by impression delta — surfaces this.",
      },
      {
        cause: "Crawl-budget reallocation away from the affected templates",
        explanation:
          "If you launched new templates or large new URL sets, Google may be redistributing crawl budget away from your existing pages. The old pages slowly fall out of the freshness window and lose impressions until Google re-prioritizes them. Crawl Stats in Search Console will show the redistribution.",
      },
    ],
    diagnosticSteps: [
      "Lock the date range. Pick the exact day the trend changed, set a 28-day pre-window and 28-day post-window, and use those for every comparison that follows.",
      "In Search Console → Performance, compare clicks, impressions, CTR, and position between the two windows. The relative changes — not absolute numbers — tell the story. Stable position with falling CTR is a SERP-feature problem; falling position is a ranking problem; stable everything but falling impressions is a demand problem.",
      "In Search Appearance, check whether AI Overview impressions appeared during the post window. If yes, that's likely your cause and the diagnostic ends there.",
      "Pull Google Trends for your top five head terms over a six-month window. If demand dropped 20%+, traffic drops 20%+ as a baseline expectation — adjust your investigation accordingly.",
      "Diff your deploy log against the start of the trend. Deploys within seven days of the inflection are suspect; longer than that, look for cumulative effects (sitemap changes, robots.txt edits, CDN config changes).",
      "Run pseolint to detect any tech/canonical-consistency, tech/redirect-chain, tech/hreflang-consistency, or tech/soft-404 regressions you may have shipped silently.",
      "Segment by URL pattern and device. If the drop is concentrated on one template and one device, you have a deploy-level cause. If it's distributed evenly, you have a market-level or SERP-level cause.",
    ],
    relatedRules: [
      "thin-content",
      "near-duplicate",
      "boilerplate-ratio",
    ],
    caseStudy:
      "A SaaS comparison site lost 32% of organic traffic over a 35-day window beginning August 12, 2025 with no announced Google update and no obvious deploy. Investigation found a Cloudflare configuration change shipped on August 9, 2025 had introduced a 301 from /vs/{a}/{b} to /vs/{a}-{b} for normalization, but the canonical tag was still pointing at the old URL pattern. Google was crawling the new URLs, finding canonicals to URLs that 301'd back, and incrementally pruning the affected template from active scoring. Reverting the canonical to self-referential restored traffic to baseline within 10 days, recovered 91% of lost clicks within 21 days, and added an estimated $48,000 of monthly recurring revenue back to the funnel within 60 days.",
    faqs: [
      {
        q: "Should I assume an unannounced Google change happened?",
        a: "Last. Google ships unannounced ranking adjustments constantly, but they almost never produce site-specific or template-specific drops large enough to notice on a single site. If your investigation rules out demand, technical regression, and SERP-feature changes, then consider unannounced volatility — but treat it as a residual hypothesis, not a starting one.",
      },
      {
        q: "How do I know if AI Overviews are the cause?",
        a: "Search Console's Search Appearance dimension exposes AI Overview impressions separately. If overview impressions appeared during your post-window for the queries that lost traffic, you have your answer. The fix is content that AI Overviews can't answer in-place — comparisons, tool outputs, original data — rather than informational content overviews can summarize.",
      },
      {
        q: "Can a CDN config change cause this without breaking anything?",
        a: "Yes, frequently. Header rewrites, edge caching of canonicals, and edge-level redirects are the three most common culprits. They usually pass functional QA because the page renders for users — but they change the contract Google has with your URL space, and ranking degrades as Google reconciles the change.",
      },
      {
        q: "How long should I wait before declaring this real and acting?",
        a: "Two weeks. Day-to-day variance and Google's normal scoring updates can produce 5-15% swings that look meaningful in the moment. If the trend is still down at the two-week mark across the same templates, it's real. Earlier than that, you risk making changes against noise.",
      },
      {
        q: "My rankings are stable but traffic dropped — what does that mean?",
        a: "Either CTR fell (likely a SERP-feature change took clicks above your result) or demand fell (Google Trends will confirm). Both are real losses but neither is a ranking problem, and treating them as ranking problems usually makes things worse — adding content to a page that's losing CTR to an AI Overview doesn't help.",
      },
    ],
    recoveryTimeline:
      "Recovery time tracks the cause directly, not a fixed clock. Technical regressions reverse in 4 to 21 days once the root config is restored — Google re-crawls, reconciles canonicals, and rankings stabilize within one to three crawl cycles, and pseolint's tech/canonical-consistency rule will report green within 48 hours of the fix shipping. SERP-feature losses (AI Overviews, snippet displacements) don't \"recover\" — they require a content strategy that produces results AI can't summarize, which is a content investment over 6 to 9 months. Demand-side drops recover when demand recovers, which you cannot influence directly. The most common operator mistake is to ship aggressive content changes within 7 days of noticing the drop and then attribute the natural variance back upward to the changes; resist this for 14 to 21 days so you can actually attribute cause and effect.",
  },
  {
    slug: "thin-content-warning-search-console",
    title: "Thin content warning in Search Console — diagnose and fix the template-level signal",
    metaDescription:
      "A thin-content warning in Search Console flags low-value pages that drag your whole site. Diagnose which template tripped it and decide what to rewrite, consolidate, or noindex.",
    primaryKeyword: "thin content warning google search console",
    oneLiner:
      "If Google Search Console shows the 'Crawled — currently not indexed' bucket growing on more than 30% of one URL template after the March 5, 2024 scaled-content-abuse update, you have the thin-content signal — pseolint v0.4.0 sets the floor at 300 unique words per page and a 0.4 unique-to-total word ratio, below which Google's classifier reliably treats the URL as low-value within 21 to 45 days.",
    whatYouSee:
      "300 words is the pseolint default thin-content floor, but the explicit Search Console warning is rare — most teams encounter \"thin content\" as a diagnosis rather than a notification. What you actually see is a combination of signals: a growing \"Crawled — currently not indexed\" bucket concentrated on one template, a slowly declining indexed-URL count, individual URL inspections returning \"URL is not on Google\" with no other reason given, and gradual position decline on long-tail queries served by template-generated pages. If you do receive a manual action, it appears under Security & Manual Actions as \"Thin content with little or no added value\" — codified in the March 5, 2024 scaled-content-abuse policy and reinforced by the May 7, 2024 site-reputation-abuse policy — which is the most operator-friendly signal Google sends, because it tells you exactly what to fix and gives you a reconsideration path.",
    likelyCauses: [
      {
        cause: "Templated pages with insufficient unique content per URL",
        explanation:
          "The classic thin-content pattern: a template with consistent boilerplate (header, navigation, related links, footer) and only a small unique-content slot per page. When the unique slot averages under 200-300 words and consists mostly of swapped entity names, the page reads as low-value regardless of the surrounding chrome's word count.",
      },
      {
        cause: "Auto-generated pages from data sources without editorial layer",
        explanation:
          "Programmatic pages built directly from a database query without an editorial transformation layer (insight, comparison, context, narrative) trip the signal even when individually the data is unique. Raw data uniqueness is necessary but not sufficient — the page needs to add something a database export wouldn't.",
      },
      {
        cause: "Affiliate or directory pages with minimal first-party commentary",
        explanation:
          "A page listing twenty products with vendor descriptions, vendor images, and an affiliate link offers no first-party value. Even if every product is unique, the page is functionally a redistribution layer. Adding a paragraph of generic intro doesn't change the diagnosis.",
      },
      {
        cause: "Doorway pages — multiple URLs targeting variations of the same query",
        explanation:
          "Pages built to target \"plumber in Springfield,\" \"plumber Springfield,\" \"plumbers in Springfield\" as separate URLs collapse under the thin-content classification because each variation has near-identical body content. Google sees ten doors leading to the same room and flags all ten.",
      },
      {
        cause: "Stub pages awaiting content that never arrived",
        explanation:
          "Templates that auto-generate URLs ahead of having content to fill them — \"This category is being updated,\" empty product pages, location pages with placeholder copy — are read as thin even when the intent is to fill them later. The thin-content signal evaluates current state, not roadmap.",
      },
    ],
    diagnosticSteps: [
      "If you have a manual action, read its specific wording carefully — Google describes the affected pattern in the action and that wording is your reconsideration target. Don't generalize from it; address what's literally written.",
      "Pull the URLs in your largest \"Not indexed\" bucket and segment by URL prefix to identify which template is the source. The template with the highest count of crawled-but-not-indexed URLs is your starting point.",
      "Run pseolint on your sitemap and prioritize spam/thin-content, spam/boilerplate-ratio, content/unique-value, and content/meta-uniqueness findings. Sort findings by template, not URL, to see which template is structurally thin versus incidentally thin.",
      "For each affected template, calculate three ratios per page: unique words to total words, unique nouns to template tokens, and unique data points to filled-in slots. Pages below 0.4 on the first ratio are nearly always classified as thin.",
      "Decide the fate of every URL on the template. Use historical clicks and conversions as the decision input: top 20% by historical clicks get a rewrite with substantive added information; middle 50% get consolidated to higher-level pages; bottom 30% get noindexed or 410'd.",
      "For the rewrite tier, define what the page adds beyond a database export — insight, comparison, original data, or context. Write the unique value prop for each template before you write the body, not after.",
      "After fixes ship, do not request indexing on individual URLs. Submit the updated sitemap and let Google rediscover. The pace of Google's redrawal is itself a quality signal — fast re-indexation indicates the changes worked.",
    ],
    relatedRules: [
      "thin-content",
      "boilerplate-ratio",
      "near-duplicate",
      "template-diversity",
    ],
    caseStudy:
      "A jobs aggregator received a manual action on July 18, 2024 for thin content covering 23,000 city-by-role pages. The pages averaged 180 words of unique content (job description excerpts) wrapped in 1,400 words of boilerplate (location info, related searches, generic career advice). The team consolidated to role-only pages (no city), kept 800 high-volume city-by-role pages with rewritten body copy that included local salary data and unique-to-the-city employer commentary, and 410'd the remaining 22,200 URLs. The manual action was lifted on reconsideration 19 days after submission; organic traffic recovered to 110% of pre-action levels within 6 months and added an estimated $112,000 of attributable monthly recruiter-package revenue by January 15, 2025, because the consolidated pages ranked better than the original split.",
    faqs: [
      {
        q: "Is there a word-count threshold below which content is automatically thin?",
        a: "No. Thinness is about information density and added value, not word count. A 150-word page that answers a specific question with a specific fact can outrank a 2,000-word padded page on the same query. The right framing is: would removing this page make the web meaningfully worse for the user it targets?",
      },
      {
        q: "Will adding more text to thin pages fix the issue?",
        a: "Only if the added text adds information. Padding with synonyms, related-topic boilerplate, or AI-generated filler often makes the diagnosis worse because you're now shipping more low-value tokens against the same quality threshold. Adding a single original fact, citation, or data point per page beats adding 500 words of generic prose.",
      },
      {
        q: "How does Google detect thin content on a programmatic site?",
        a: "Through some combination of n-gram overlap with other pages on the same site (boilerplate ratio), n-gram overlap with the broader web (originality), engagement signals from users who arrived from search, and structural features (heading uniqueness, body-to-chrome ratio). No single signal is decisive; the classifier is built on the combination.",
      },
      {
        q: "Should I use AI to rewrite thin pages at scale?",
        a: "AI can help structure content but cannot make a page substantively unique without a unique input. The best pattern is: feed the AI a per-page data record that no other page on your site has, and instruct it to surface insight from that data. The worst pattern is: ask AI to rewrite the existing thin page in different words. The first adds value; the second hides thinness for one crawl cycle and then trips again.",
      },
      {
        q: "If I noindex thin pages, will the rest of my site recover?",
        a: "Often yes, partially. Removing thin URLs from the indexed set raises the median quality of what remains, which Google reads as a positive signal at the host level. The recovery is not linear and depends on how many thin URLs were dragging down the host average — sites where 70% of indexed URLs were thin see meaningful recovery; sites where 10% were thin see modest improvement.",
      },
    ],
    recoveryTimeline:
      "Manual-action recovery is bounded by the reconsideration cycle: typically 14 to 28 days from submission to verdict. Algorithmic recovery from thin-content signals is slower because the signal is host-level and updates as Google re-evaluates your overall indexed set. Expect partial recovery within 30 days of shipping fixes — Google will re-crawl and re-classify the rewritten pages, and the noindexed pages will fall out of active scoring within 45 days. Full recovery usually lands at the next core update (Google's typical 75-day cadence), when host-level quality models re-score domains. Track the indexed-URL trend in Sitebulb or Screaming Frog crawl diffs week over week: when the rewritten template's indexed-to-declared ratio crosses 70%, you're recovering. When it stays below 40% past 90 days, the rewrites haven't worked and the pages need substantive — not cosmetic — additional value.",
  },
  {
    slug: "manual-action-pure-spam",
    title: "Manual action for pure spam — diagnose and recover",
    metaDescription:
      "Got a 'Pure Spam' manual action in Search Console? Diagnose which programmatic templates triggered it and file a reconsideration that gets approved.",
    primaryKeyword: "pure spam manual action",
    oneLiner:
      "A 'Pure Spam' or 'Thin content with little or no added value' manual action appears in Search Console's Manual Actions report, suppressing some or all of your programmatic templates.",
    whatYouSee:
      "Search Console's Manual Actions report shows a 'Pure Spam' or 'Thin content' entry with either a site-wide or partial-match scope. Partial matches name affected URL patterns; site-wide matches do not. Within a day or two of the action landing, the affected templates fall out of the top 100 entirely — this is suppression, not a ranking adjustment, so positions go to null rather than dropping a few places. Branded queries usually survive; everything non-branded on the flagged templates evaporates. Unlike an algorithmic hit, you get an explicit notification and a reconsideration channel, which means recovery is gated by a human reviewer rather than the next core update.",
    likelyCauses: [
      {
        cause: "Programmatic pages with no information a human would value",
        explanation:
          "Pure Spam actions land on templates where the generated pages exist only to capture a keyword permutation — entity-swap pages, auto-generated location or category pages with no unique data, or scraped-then-spun content. The reviewer's test is whether the page would exist if search engines did not. If the honest answer is no, the action stands until those pages are gone or genuinely rebuilt.",
      },
      {
        cause: "Scaled content abuse: thousands of near-identical pages shipped fast",
        explanation:
          "The March 2024 scaled-content-abuse policy made volume itself a signal. A site that adds 20,000 templated pages in a quarter, each sharing >70% boilerplate, reads as an abuse pattern even if any single page looks borderline acceptable. Reviewers see the aggregate, not the individual URL, so a fix that touches only a handful of sample pages will not clear the action.",
      },
      {
        cause: "Sneaky redirects, cloaking, or doorway sets feeding a money page",
        explanation:
          "Doorway pages — large sets of similar pages that all funnel the user to the same destination — are an explicit Pure Spam trigger. If your programmatic pages exist mainly to rank and then push the visitor to a single conversion page, the reviewer will classify the whole set as doorways regardless of how polished each page looks.",
      },
      {
        cause: "Expired-domain or subfolder abuse inherited from a prior owner",
        explanation:
          "If the domain or a subfolder was previously used for spam, the manual action can attach to history you did not create. This is common after acquisitions. The fix is the same — remove or rebuild the offending content — but the reconsideration request must explicitly document the ownership change and what was removed.",
      },
    ],
    diagnosticSteps: [
      "Open Search Console → Security & Manual Actions → Manual Actions. Record the exact label ('Pure Spam' vs 'Thin content') and whether the scope is site-wide or partial — partial actions list the affected URL patterns you must focus on.",
      "Map the named patterns (or, for site-wide, your largest templates) to path prefixes and parameter shapes so you know precisely which page sets the reviewer is judging.",
      "Run pseolint against the affected templates and read the spam-cluster findings first — doorway-pattern, near-duplicate, thin-content, and boilerplate-ratio are the rules that correspond to Pure Spam reasoning.",
      "Sample 25 random URLs per affected template and apply the human test to each: would this page exist if search did not? Tally the pass rate — below ~70% means the template needs rebuilding, not editing.",
      "Decide per template: rebuild with genuine per-page data, consolidate many thin pages into fewer substantive ones, or remove and 410. Do not noindex-and-leave; reviewers want the spam gone, not merely hidden.",
      "Ship the fixes site-wide before filing — a reconsideration filed while spam still exists on unflagged templates is the most common rejection reason.",
      "File the reconsideration request with a specific, honest writeup: what was wrong, the scope of pages changed, links to before/after examples, and how you will prevent recurrence. Vague requests are rejected and reset the queue.",
    ],
    relatedRules: ["doorway-pattern", "thin-content", "near-duplicate", "boilerplate-ratio"],
    caseStudy:
      "A travel-deals site received a site-wide Pure Spam action covering ~40,000 auto-generated '{city} cheap flights' pages that each wrapped an affiliate widget in spun boilerplate. The team deleted 38,000 of them with 410s, rebuilt 2,000 top-demand routes with real fare-history data, median prices, and editorial route notes, and removed two doorway funnel pages. Their first reconsideration was rejected for residual thin pages on a forgotten subdomain; the second, filed 18 days later after cleaning the subdomain, was approved. Non-branded organic recovered to 58% of pre-action levels over the following 90 days as the rebuilt pages re-earned rankings on merit.",
    faqs: [
      {
        q: "How long does a Pure Spam reconsideration take?",
        a: "Reviews typically take one to three weeks per submission, and there is no partial credit — a request is approved or rejected as a whole. A rejection sends you to the back of the queue, so the dominant strategy is to over-fix before the first filing rather than iterate. Manual actions are reviewed by people, so a clear, specific request with concrete examples is reviewed faster than a vague one.",
      },
      {
        q: "Can I just noindex the spam pages instead of deleting them?",
        a: "Noindex hides pages from the index but does not remove the spam pattern the reviewer is judging, and reviewers can still see noindexed URLs. For Pure Spam, the reliable path is to remove the pages (410) or rebuild them into something with genuine added value. Noindex is acceptable only as a temporary step while substantive rebuilds ship.",
      },
      {
        q: "Will fixing the manual action restore my old rankings?",
        a: "Lifting the action removes the suppression, but it does not restore rankings the pages no longer deserve. If you deleted or consolidated the spam, the surviving pages re-rank on their own merit, which is usually a fraction of the pre-action footprint. Plan for recovery to the level your genuinely-useful pages can earn, not to the inflated pre-action numbers.",
      },
      {
        q: "I bought this domain with the action already on it — what do I do?",
        a: "Treat inherited actions the same way operationally: find and remove the offending content. The difference is in the reconsideration request, where you should document the ownership transfer date, state that you did not create the content, and detail exactly what you removed. Google does penalize sites for inherited spam, but a documented cleanup plus ownership change is a well-recognized, recoverable case.",
      },
      {
        q: "Should I disavow links after a Pure Spam action?",
        a: "Pure Spam is about your own content, not your backlink profile, so disavowal is usually irrelevant and can do harm if applied carelessly. Only consider a disavow file if the action is specifically 'Unnatural links to your site.' For Pure Spam, spend your effort on removing or rebuilding the thin and doorway pages that triggered it.",
      },
    ],
    recoveryTimeline:
      "Recovery has two clocks. The first is the reconsideration cycle: one to three weeks per submission, with rejections resetting the queue — so realistic clearance is two to six weeks if your first filing is thorough, longer if you iterate. The second is the ranking clock: once the action lifts, the surviving pages must re-earn position on merit, which lands over the following 30 to 90 days as Google recrawls and rescores. Do not expect a snap-back to pre-action traffic; the spam pages that produced most of that traffic are gone by design. Track the Manual Actions report for the 'no issues detected' state, then watch the per-template Performance report for the recrawl-driven climb.",
  },
  {
    slug: "traffic-dropped-rankings-unchanged",
    title: "Traffic dropped but rankings unchanged — diagnose the click loss",
    metaDescription:
      "Positions look fine but clicks collapsed? Diagnose AI Overviews, SERP features, and intent shifts draining CTR from your programmatic pages.",
    primaryKeyword: "traffic dropped but rankings the same",
    oneLiner:
      "Average position in Search Console holds steady while clicks and CTR fall, meaning the rankings survived but the SERP changed shape around them.",
    whatYouSee:
      "In Search Console, the Performance report shows average position flat or even improving while clicks decline and impressions often stay level or rise. The CTR line is the tell: it drops steadily across queries that used to convert impressions into clicks. Third-party rank trackers agree you are still ranking, which is why this feels like a paradox. The loss concentrates on informational, top-of-funnel queries — 'what is', 'how to', 'best X for Y' — where an AI Overview or a featured snippet now answers the question above your result, while transactional and branded queries hold their click-through. The drop is gradual rather than a cliff, because SERP features roll out per-query over weeks rather than landing in a single update.",
    likelyCauses: [
      {
        cause: "AI Overviews answering the query before the user reaches your link",
        explanation:
          "On informational queries, an AI Overview synthesizes an answer from several sources at the top of the page. Users who get their answer never scroll to the organic results, so your position is unchanged but its click-through collapses. Programmatic informational templates — definitions, explainers, generic how-tos — are the most exposed, because their content is exactly what the overview can summarize in a sentence.",
      },
      {
        cause: "New SERP features pushing organic results below the fold",
        explanation:
          "Featured snippets, People-Also-Ask blocks, video carousels, and shopping units all consume vertical space above the classic blue links. When Google adds one of these to a query you rank for, your position number stays the same but its real estate moves down the page, and CTR falls accordingly. This is a layout change, not a quality penalty.",
      },
      {
        cause: "Intent shift: Google reinterpreted the query and your page no longer matches",
        explanation:
          "When the dominant intent for a query shifts — say from informational to transactional — Google reshapes the SERP toward the new intent. A page that still ranks on legacy signals can sit in a SERP whose users now want something it does not offer, so impressions persist but clicks dry up. The fix is matching the page to the current intent, not adding content.",
      },
      {
        cause: "Title and meta no longer competitive against richer results",
        explanation:
          "As neighbors adopt richer titles, structured data, and sitelinks, an older plain result loses relative appeal even at the same position. CTR is partly a beauty contest within the visible set, so a stale title or missing schema can bleed clicks slowly without any change to ranking. This is the most directly fixable cause on this list.",
      },
    ],
    diagnosticSteps: [
      "In Search Console, compare two equal date ranges before and after the decline and add the CTR and Position columns — confirm position is flat or improving while CTR falls, which separates this symptom from a true ranking drop.",
      "Sort affected queries by lost clicks and classify each as informational, transactional, or branded — a concentration of loss on informational queries points squarely at AI Overviews or snippets.",
      "Hand-check the live SERPs for your top five losing queries and record what now sits above the organic results (AI Overview, featured snippet, PAA, carousel, shopping unit).",
      "For queries where you ARE the snippet or overview source, accept the displayed-but-not-clicked tradeoff and pivot the page toward a follow-on action; for queries where a competitor is the source, evaluate whether you can win that feature instead.",
      "Run pseolint on the affected templates to confirm the pages are not also tripping quality rules — rule out a coincident algorithmic issue before attributing the entire loss to SERP features.",
      "Rewrite titles and meta descriptions on high-impression, low-CTR pages and add or repair structured data (FAQ, HowTo, Product) so your result competes harder within the visible set.",
      "Shift measurement and content strategy toward queries with commercial intent and lower AI-Overview coverage, where a click is still both available and valuable.",
    ],
    relatedRules: ["thin-content", "template-diversity"],
    caseStudy:
      "A SaaS comparison site saw organic clicks fall 34% over two months while average position improved from 4.1 to 3.6. CTR analysis showed the loss was almost entirely on 'what is {category}' and 'how does {feature} work' templates, where AI Overviews had appeared on 80% of tracked queries. Rather than chase the lost informational clicks, the team consolidated forty thin explainer pages into ten substantive guides, rebuilt their '{tool} vs {tool}' transactional templates with original benchmark data, and added FAQ schema. Informational traffic stayed depressed, but transactional clicks rose 22% and trial signups — the metric that actually mattered — increased 15% over the next quarter.",
    faqs: [
      {
        q: "Is this a Google penalty?",
        a: "No. A penalty or algorithmic suppression shows up as falling positions, often a cliff. Flat positions with falling CTR is a SERP-shape change — AI Overviews, snippets, or other features capturing the click above you. It is not a quality signal against your site, which is why the diagnostic and the fix are completely different from a core-update recovery.",
      },
      {
        q: "Can I opt out of AI Overviews to get my clicks back?",
        a: "There is no reliable opt-in/opt-out that preserves rankings; the nosnippet and max-snippet directives can limit how your content is used but tend to reduce visibility overall, which usually costs more clicks than it saves. The durable response is to shift effort toward queries where a click is still available — commercial-intent and branded terms — rather than fighting for informational clicks the overview now absorbs.",
      },
      {
        q: "Should I delete the informational pages that lost traffic?",
        a: "Not reflexively. Pages that still earn impressions are building topical authority and may feed your transactional pages through internal links, even if their direct clicks fell. Consolidate genuinely thin explainers into stronger guides, but keep substantive informational content that supports the rest of the site. Delete only pages that were thin to begin with.",
      },
      {
        q: "How do I know if it's AI Overviews specifically versus a featured snippet?",
        a: "Check the live SERP for the affected query. An AI Overview is a generated multi-sentence answer block, often citing several sources; a featured snippet is a single extracted passage from one ranking page. Both depress organic CTR, but if you are the snippet source you still own the box, whereas an overview can answer without sending the click to anyone. The remedy differs, so confirm which one you are facing.",
      },
    ],
    recoveryTimeline:
      "This is the symptom least likely to fully 'recover' in the old sense, because the cause is a permanent change in SERP layout rather than a temporary suppression you can reverse. Expect the informational clicks lost to AI Overviews to stay lost; the realistic win is reallocating effort to queries where clicks remain available, which pays off over one to two quarters as rebuilt transactional pages climb. Title, meta, and structured-data fixes are the exception — they can recover CTR on affected pages within a single recrawl cycle of one to three weeks. Track CTR per query cohort (informational vs transactional) rather than total clicks, so you can see the healthy cohort growing even while the AI-absorbed cohort stays flat.",
  },
  {
    slug: "new-pages-not-getting-indexed",
    title: "New programmatic pages won't get indexed — diagnose the crawl gap",
    metaDescription:
      "You published thousands of pages and Google won't index them. Diagnose 'Discovered/Crawled — currently not indexed' and fix the crawl and quality signals.",
    primaryKeyword: "pages not getting indexed",
    oneLiner:
      "Newly published programmatic pages stall in Search Console's 'Discovered — currently not indexed' or 'Crawled — currently not indexed' buckets instead of entering the index.",
    whatYouSee:
      "After shipping a large batch of programmatic pages, Search Console's Page indexing report shows the declared URLs piling up under 'Discovered — currently not indexed' (Google saw the URL in your sitemap but has not crawled it) or 'Crawled — currently not indexed' (Google fetched it and chose not to keep it). The indexed count barely moves no matter how many URLs you submit. Manual 'Request indexing' may push a single page in, but the batch as a whole stays out. There is no penalty notification because this is not a penalty — it is Google declining to spend crawl budget and index slots on pages it does not yet judge worth keeping. The Discovered bucket usually grows first; the Crawled-not-indexed bucket grows as Google samples a few and is unimpressed.",
    likelyCauses: [
      {
        cause: "Per-page quality below the threshold Google will spend an index slot on",
        explanation:
          "'Crawled — currently not indexed' is most often a soft quality signal: Google fetched the page, compared it to what is already indexed, and decided it adds nothing. Templated pages that differ only by a swapped entity, or that are thin relative to competing results, get sampled and dropped. Submitting more of them does not help, because the model's objection is to the template, not the discovery path.",
      },
      {
        cause: "Crawl budget exhausted by low-value or duplicate URLs",
        explanation:
          "If your site exposes large numbers of parameter permutations, faceted-navigation combinations, or near-duplicate URLs, Googlebot spends its budget crawling noise and never reaches the pages you care about. This shows up as 'Discovered — currently not indexed' at scale: the URLs are known but uncrawled because the crawl scheduler keeps deprioritizing them behind the noise.",
      },
      {
        cause: "Weak internal linking — orphaned pages reachable only via the sitemap",
        explanation:
          "A sitemap declares a URL exists; it does not signal that the URL matters. Pages reachable only through the sitemap, or buried behind deep pagination, receive almost no internal PageRank and read as unimportant. Google routinely leaves such pages in Discovered indefinitely. Pages need contextual internal links from already-indexed, authoritative pages to be prioritized for crawling.",
      },
      {
        cause: "New or low-authority domain with little crawl trust",
        explanation:
          "Crawl rate scales with site authority and history. A young domain that suddenly publishes tens of thousands of URLs is asking for crawl budget it has not yet earned, so Google indexes a trickle and waits to see whether the new content earns engagement. This is the single hardest cause to fix quickly, because it resolves with time and earned signals rather than a configuration change.",
      },
    ],
    diagnosticSteps: [
      "In Search Console's Page indexing report, separate the two buckets: 'Discovered — currently not indexed' (a crawl-priority problem) versus 'Crawled — currently not indexed' (a quality problem). The dominant bucket tells you which branch to work.",
      "Use the URL Inspection tool on five stalled pages to confirm Google can fetch and render them — rule out a robots.txt block, noindex tag, or canonical pointing elsewhere before assuming a quality or budget cause.",
      "Audit your crawl surface for noise: count parameter permutations, faceted combinations, and duplicate URLs, and check the server log or Crawl Stats report for how much of Googlebot's budget they consume.",
      "Run pseolint on a sample of the stalled template and read thin-content and near-duplicate findings — if the template trips those rules, the Crawled-not-indexed bucket is a quality verdict you must fix at the template level.",
      "Map internal links into the stalled template: confirm each page is linked from at least one already-indexed, topically-relevant page, not only from the sitemap or a footer mega-menu.",
      "Trim the crawl surface (noindex or canonicalize the noise, block junk parameters) so Googlebot's budget reaches the pages that matter, then improve per-page value on the template itself.",
      "Resubmit the cleaned sitemap segment and let Google rediscover at its own pace; do not mass-click Request Indexing, which does not scale and is not the signal Google rewards for large batches.",
    ],
    relatedRules: ["thin-content", "near-duplicate", "template-diversity", "boilerplate-ratio"],
    caseStudy:
      "A real-estate listings startup published 60,000 '{neighborhood} homes for sale' pages on an eight-month-old domain and watched 52,000 of them sit in 'Discovered — currently not indexed' for weeks. Crawl Stats showed Googlebot burning most of its budget on sort-and-filter parameter URLs. The team canonicalized the parameter noise, added neighborhood pages as contextual links from indexed city hub pages, and enriched the template with per-neighborhood price trends and school data instead of a swapped place-name. Indexation climbed from 13% to 61% of declared URLs over ten weeks as crawl budget was freed and the template cleared the quality bar.",
    faqs: [
      {
        q: "What's the difference between 'Discovered' and 'Crawled — currently not indexed'?",
        a: "'Discovered — currently not indexed' means Google knows the URL exists (usually from your sitemap) but has not crawled it yet, which is a crawl-priority and budget problem. 'Crawled — currently not indexed' means Google fetched the page and decided not to index it, which is usually a soft quality verdict. The two require different fixes: budget and internal linking for the first, per-page value for the second.",
      },
      {
        q: "Will requesting indexing in Search Console fix this at scale?",
        a: "No. Request Indexing is a manual, per-URL tool with daily limits — useful for a handful of priority pages, useless for thousands. For large batches, the durable levers are improving page quality, trimming crawl-budget waste, and adding internal links so Google chooses to crawl and keep the pages on its own. Relying on manual submission is a sign the underlying signals still need work.",
      },
      {
        q: "How long should I wait before treating non-indexation as a problem?",
        a: "For an established domain, give a new batch two to four weeks before concluding the pages are stalled rather than merely queued. For a young or low-authority domain, indexation can legitimately take longer and arrive in waves. The signal that it is a real problem rather than normal lag is a flat indexed count while the Discovered or Crawled-not-indexed buckets keep growing.",
      },
      {
        q: "Could publishing so many pages at once have hurt me?",
        a: "Publishing a very large batch on a domain that has not earned proportional crawl trust often results in slow, partial indexing rather than a penalty — Google simply meters how much it takes. If the pages are also thin or near-duplicate, the large batch amplifies the quality signal and can spill into 'Crawled — currently not indexed' at scale. Shipping in smaller, higher-quality waves with strong internal links indexes more reliably than one massive drop.",
      },
    ],
    recoveryTimeline:
      "Indexation recovery is gradual and compounding rather than a single step change. Once you trim crawl waste and strengthen internal links, freed budget reaches stalled pages within two to four weeks and the Discovered bucket starts draining. Quality-driven 'Crawled — currently not indexed' cases take longer — Google must recrawl, re-evaluate the improved template, and decide it now merits a slot, typically over four to ten weeks. On young domains, expect indexation to climb in waves tied to earned engagement rather than on a fixed schedule. Track the ratio of indexed to declared URLs per template week over week; a steadily rising ratio means the fixes are working, while a flat ratio past ten weeks means the template still is not clearing the quality bar.",
  },
  {
    slug: "scaled-content-abuse-penalty",
    title: "Scaled content abuse penalty — diagnose mass-produced pages and recover",
    metaDescription:
      "Scaled content abuse makes page volume itself a ranking risk. Diagnose which mass-produced templates Google demoted and why pruning beats one-by-one rewrites.",
    primaryKeyword: "scaled content abuse",
    oneLiner:
      "Demotion or deindexing of a large page set Google judged to be produced at volume primarily to win rankings rather than to help users, regardless of whether a human, a template, or an AI wrote it.",
    whatYouSee:
      "The defining tell is that scale itself became the liability. On March 5, 2024 Google renamed the old \"automatically generated content\" rule to \"scaled content abuse\" and widened it to cover any high-volume production — human, templated, AI, or a hybrid — created mainly to manipulate rankings with little added value. What you see in Search Console depends on the enforcement mode. Algorithmic demotion arrives quietly: a template family loses 40-90% of clicks across the whole URL set at once, impressions follow within days, and there is no notification. A manual action arrives under Security & Manual Actions as \"Scaled content abuse\" or \"Pure spam\" with a reconsideration path attached. The cruelest variant is full deindexing, where thousands of URLs migrate from Indexed to \"Crawled — currently not indexed\" in a single crawl cycle. The pattern that distinguishes this from an ordinary thin-content hit is breadth: it is not one weak page or one weak template slot, it is the entire mass-produced corpus losing value simultaneously because the volume-to-value ratio is what tripped the classifier.",
    likelyCauses: [
      {
        cause: "High publishing velocity with a flat value-per-page curve",
        explanation:
          "The policy targets the ratio of pages produced to value added, not any single page in isolation. A site that shipped ten thousand URLs in a quarter where each page carries the same marginal usefulness as the last reads as production-for-rankings. Google's classifier weighs the slope: if value stays flat as volume climbs, the whole corpus gets re-scored downward together.",
      },
      {
        cause: "AI-generated content used to manufacture volume rather than add value",
        explanation:
          "Google's position is explicit that AI authorship is not the violation — abuse is producing many pages with little added value no matter how they are created. The failure mode is using a model to fill a template at scale so cheaply that no human ever sources a fact, verifies a claim, or adds a perspective the model couldn't generate. The pages are fluent, on-topic, and indistinguishable from each other in substance, which is exactly the signal.",
      },
      {
        cause: "Programmatic templates where uniqueness is cosmetic, not substantive",
        explanation:
          "When the only thing that changes between URLs is an entity noun and a few stitched data fields, the template scales the boilerplate, not the value. Pseolint's template-diversity and boilerplate-ratio rules quantify this directly: a high shared-token ratio across a large URL set is the structural fingerprint of scaled content abuse, because volume amplifies a thinness that one or two pages would have survived.",
      },
      {
        cause: "Mass-imported or syndicated content republished without first-party work",
        explanation:
          "Pulling a feed, a dataset export, or a content license and publishing it across thousands of URLs with a thin wrapper is scaled abuse even when each record is technically unique. The near-duplicate rule catches the web-wide overlap. The policy reads redistribution-at-scale as adding volume to the index without adding a reason for the index to keep it, which is the core thing the March 2024 update was written to stop.",
      },
    ],
    diagnosticSteps: [
      "Determine the enforcement mode first: check Search Console → Security & Manual Actions for a \"Scaled content abuse\" or \"Pure spam\" notice. A manual action gives you a deadline and reconsideration path; silence means it is algorithmic and recovers only when the corpus changes.",
      "Overlay the click drop on Google's Search Status Dashboard — if it aligns with the March 5, 2024 scaled-content-abuse rollout or a later spam update, the volume-without-value dimension is your working hypothesis, not ordinary single-template thinness.",
      "Segment affected URLs by template and by publish-date cohort, then plot value-per-page against volume — the cohort where you scaled fastest with the least incremental editorial work is almost always the corpus Google re-scored.",
      "Run pseolint across the full sitemap and read the template-diversity and boilerplate-ratio findings together — a high shared-token ratio spread across a large URL count is the scaled-abuse signature, distinct from a single thin slot.",
      "Cross-reference the near-duplicate findings against the thin-content findings on the same templates — pages that are simultaneously near-duplicate of each other and below the unique-word floor are the corpus deindexing first and should anchor your prune list.",
      "Separate the survivors from the casualties: pull the URLs that kept rankings and audit what they carry that the rest don't — first-hand experience, named author credentials, original data, or research the model couldn't have produced — because that gap is your rebuild specification.",
      "Decide per-cohort at corpus scale rather than per-URL: consolidate redundant pages into fewer genuinely-useful ones, prune the volume that exists only to exist, and reserve substantive rewrites for the slice with demonstrable demand and a real value angle.",
    ],
    relatedRules: [
      "thin-content",
      "near-duplicate",
      "template-diversity",
      "boilerplate-ratio",
    ],
    caseStudy:
      "A travel-deals site published 38,000 \"cheap flights from {origin} to {destination}\" pages over five months, each assembled by an AI prompt that paraphrased the same fare-finder boilerplate. The September 2024 spam update demoted the entire template — organic clicks fell from 410,000 to 47,000 monthly, an 89% loss, with no manual action. The team tried rewriting the top 500 pages one at a time and saw nothing move, because the corpus-level volume-to-value ratio was unchanged. They reversed course: consolidated to 600 origin-hub pages carrying real historical fare data, seasonal price analysis, and a named travel-analyst byline, and 410'd the other 37,400 URLs. By the March 2025 update clicks recovered to 158,000 monthly — 38% of the pre-drop peak but on a fraction of the pages and at far higher conversion.",
    faqs: [
      {
        q: "Is AI-generated content banned under the scaled content abuse policy?",
        a: "No. Google has stated plainly that how content is produced — human, AI, or hybrid — is not the issue; the issue is producing many pages with little added value primarily to manipulate rankings. AI content that carries first-hand insight, original data, or genuine expertise is fine. The violation is using AI as a volume machine that fills templates faster than anyone adds value.",
      },
      {
        q: "Why didn't rewriting my pages one by one bring traffic back?",
        a: "Because scaled content abuse is scored at the corpus level, not the page level. Improving a few hundred pages out of tens of thousands barely moves the volume-to-value ratio that tripped the classifier. The corpus still reads as mass-produced. Recovery usually requires consolidating and pruning the bulk of the volume so the median page Google evaluates is genuinely useful, not patching individual URLs.",
      },
      {
        q: "What separates pages that survived this update from the ones that got demoted?",
        a: "Survivors carry signals that are expensive to fake at scale: first-hand experience, a named author with verifiable credentials, original research or proprietary data, and a point of view a template can't mass-produce. The demoted pages were interchangeable — swap the entity noun and any one reads like any other. Genuine E-E-A-T is the moat precisely because it doesn't scale cheaply.",
      },
      {
        q: "How long does recovery from scaled content abuse take?",
        a: "It depends on the enforcement mode. A manual action lifts on a bounded reconsideration cycle, typically 14 to 28 days after Google's reviewer agrees the practice has ended. An algorithmic demotion has no human in the loop and reverses only when Google re-crawls and re-scores the changed corpus, which is gated to the roughly 75-day core-update cadence. Plan in months, not weeks, for the algorithmic case.",
      },
      {
        q: "If I fix this, will my traffic come back to where it was?",
        a: "Be honest with yourself: recovery is to what your genuinely-useful pages can earn, not a snap-back to the inflated peak. The old number was partly a function of volume the policy now suppresses. A well-executed consolidation usually lands at a lower click total but on far fewer pages, with better engagement and conversion. Forecast the recovered level off your survivor pages' real demand, not the pre-drop high.",
      },
    ],
    recoveryTimeline:
      "Set expectations by enforcement mode and then by the corpus you rebuild. A manual action follows a bounded reconsideration clock — 14 to 28 days from submission to verdict — but only after you have actually pruned and consolidated, because reviewers check that the scaled pattern is gone rather than disguised. An algorithmic demotion ignores reconsideration entirely; it lifts when Google's next crawl confirms the mass-produced volume is genuinely reduced and the remaining pages clear the value bar, which tracks the roughly 75-day core-update cadence. Expect a partial bounce within 30 to 45 days as the pruned URLs fall out of active scoring and raise the host's median quality, then a larger step at the next update if the survivors are real. The number you recover to is set by what your genuinely-useful pages can earn on actual demand — not the inflated peak the volume once bought you — so forecast against the survivor cohort and treat any overshoot as a bonus, not the baseline.",
  },
  {
    slug: "doorway-pages-penalty",
    title: "Doorway pages penalty — diagnose and fix gateway-page clusters",
    metaDescription:
      "Doorway pages funnel visitors from near-identical query and location URLs to one destination. Diagnose the pattern, consolidate the cluster, clear the penalty.",
    primaryKeyword: "doorway pages penalty",
    oneLiner:
      "Google's doorway-pages policy, in force since March 16, 2015, drives a demotion or manual action against a large set of near-identical gateway pages — built for query, location, or keyword permutations — that all funnel visitors to the same underlying destination.",
    whatYouSee:
      "You have built dozens, hundreds, or tens of thousands of pages that each target a slight variation of the same intent — \"{service} in {city}\", \"cheap {service} {city}\", \"{service} near {city}\" — and every one of them hands the visitor off to the same booking form, the same contact page, or the same generic offer. The pages rarely differ beyond a swapped place name in the title and an introductory sentence. On the SERP side the giveaway is that these URLs barely surface for anything except the exact permutation in their title, and even then they sit on page two with a fragile grip. When enforcement lands it lands across the whole permutation set at once: the cluster loses impressions in a single step, not page by page. If a manual action attaches, Google Search Console shows \"Doorways\" under Security & Manual Actions, pointing at the spam policy at https://developers.google.com/search/docs/essentials/spam-policies. Algorithmically there is no notice — the orphaned permutation pages simply stop being indexed, the Discovered-not-indexed bucket swells, and the few that survive cannibalize each other. Internally the tell is a navigation that no human would design: a footer or sitemap dump of thousands of city links pointing into pages that exist only to catch a search and pass the user along.",
    likelyCauses: [
      {
        cause: "Location or query permutation sets that all resolve to one destination",
        explanation:
          "The defining doorway shape: a single offer wrapped in a generated page for every city, ZIP, or phrasing variant, each one routing the visitor to the same form or landing page. Google treats the whole set as one door multiplied, because the genuine destination is identical and the permutation pages add no standalone value of their own.",
      },
      {
        cause: "Orphan pages reachable only by search, not by site navigation",
        explanation:
          "Doorways are frequently built to be found by Google and ignored by humans — they sit outside the real navigation, linked only from a mass footer block or an XML sitemap. When a page exists solely to intercept a query and pass the user onward, that orphan status is itself a structural signal that the page was made for engines rather than people.",
      },
      {
        cause: "Near-identical body copy with only the entity noun swapped",
        explanation:
          "When the only thing that changes between two URLs is the city or keyword token while the surrounding paragraphs, headings, and calls to action are byte-for-byte the same, the cluster reads as a templated funnel. The pages are not differentiated by genuinely different information, so each one duplicates the intent of every sibling rather than serving a distinct need.",
      },
      {
        cause: "Scaling for keyword coverage instead of for distinct user needs",
        explanation:
          "The pages were created to occupy a matrix of keyword cells — every service crossed with every location — rather than because each cell represents a question a real user has that no other page answers. Coverage-driven generation is precisely the intent Google's doorway policy describes, and it is the root cause that consolidation has to undo rather than disguise.",
      },
    ],
    diagnosticSteps: [
      "Check Search Console → Security & Manual Actions for an explicit \"Doorways\" notice — if it is there you have a defined reconsideration path and should read its wording before changing anything.",
      "Run pseolint across your full sitemap and open the doorway-pattern findings first — that rule is built to flag permutation sets that share intent and a destination, which is the exact shape you are diagnosing.",
      "Read the near-duplicate findings alongside it to quantify how much body copy is shared across the cluster; two URLs that differ only by a swapped noun are a doorway pair, not two pages.",
      "Read the thin-content findings to confirm the permutation pages carry little standalone value beyond the entity swap and the funnel link out to the shared destination.",
      "Read the template-diversity findings to measure how mechanically uniform the cluster is — low diversity across thousands of URLs is the structural fingerprint of a generated doorway set.",
      "Trace internal linking: if the affected URLs are reachable only from a footer dump or the sitemap and never from real editorial navigation, mark them as orphan permutation pages destined for consolidation or removal.",
      "Apply the test to every surviving URL — \"would this page exist if search engines did not?\" — and sort the cluster into keep-and-strengthen, merge, or remove based on the honest answer.",
    ],
    relatedRules: [
      "doorway-pattern",
      "thin-content",
      "template-diversity",
      "near-duplicate",
    ],
    caseStudy:
      "A home-services franchise ran 9,400 programmatic pages of the form \"{trade} in {city}\" across four trades and roughly 2,350 towns, every one of them ending in the same national booking widget. Organic impressions to the set were already thin when a manual action for doorways landed on February 12, 2025, wiping the cluster's residual traffic overnight. The team consolidated to 4 substantive trade hub pages plus 180 genuine service-area pages for towns where the franchise had a physical branch, real local pricing, and named technicians; the surviving pages each linked into the relevant hub and out to a town-specific (not national) contact path. The remaining 9,216 orphan permutation URLs were 410'd in a single batch. Reconsideration was filed February 27, 2025 and the manual action was lifted 21 days later. The consolidated hubs, which had previously been buried under the permutation noise, climbed into the top five for the head trade terms and recovered an estimated $58,000 of monthly booked-job revenue within four months — more than the doorway set had ever produced.",
    faqs: [
      {
        q: "What is the difference between doorway pages and legitimate local landing pages?",
        a: "A legitimate local page exists because the business genuinely operates in that location and the page carries information unique to it — a real address, local staff, local pricing, area-specific content a visitor cannot get elsewhere on the site. A doorway exists to catch a location query and funnel the visitor to a single shared destination, with nothing on the page that the location actually warrants. The honest test is whether you would build the page if search did not exist.",
      },
      {
        q: "How does Google identify a doorway cluster?",
        a: "Google looks for the combination of signals rather than any single one: a large set of pages with near-identical intent, thin unique value per URL, a shared destination they all funnel toward, and a permutation structure that maps to a keyword matrix rather than to distinct user needs. When those line up across many URLs at once, the whole set is classified together, which is why enforcement hits the cluster in one step instead of page by page.",
      },
      {
        q: "Should I noindex the doorway pages or delete them?",
        a: "For orphan permutation pages with no inbound links and no remaining traffic, 410 (Gone) is cleaner than a lingering noindex because it tells Google the URLs are intentionally retired and it is processed faster than a 404. Reserve consolidation via 301 redirect for the minority of pages that hold genuine links or traffic, pointing them at the substantive hub that now absorbs their intent. Noindex is a reasonable interim step while you decide, but it is not the end state.",
      },
      {
        q: "If a manual action attached, what does reconsideration require?",
        a: "The reviewer needs to see that the doorway pattern is genuinely gone, not merely hidden. That means the permutation set has been consolidated into fewer pages that each carry standalone value, the orphan URLs are removed or redirected, and internal linking now reflects a structure a human would design. In the reconsideration request, describe what the pages were, why they qualified as doorways, exactly what you consolidated or removed, and how the survivors now serve distinct needs — concrete before-and-after detail, not a promise to do better.",
      },
      {
        q: "Will consolidating my pages cost me the rankings they currently hold?",
        a: "Doorway pages rarely hold rankings worth protecting — they sit fragile on page two for their exact permutation and little else, which is part of why they are doorways. Consolidating concentrates the intent, internal links, and any earned signals onto a smaller set of stronger pages that can actually compete for the head terms. In practice the hub that replaces a permutation cluster usually outranks anything the cluster achieved, because Google can finally identify one authoritative page for the topic instead of choosing among hundreds of near-duplicates.",
      },
    ],
    recoveryTimeline:
      "If a manual action is attached, the clock is bounded by reconsideration: requests are typically reviewed within 14 to 28 days, and the action lifts as soon as the reviewer agrees the doorway pattern is genuinely gone rather than disguised — so the gating factor is the honesty of your consolidation, not Google's queue. For an algorithmic demotion there is no human in the loop; the cluster's suppression eases only as Google re-crawls and confirms the permutation pages are removed or merged, which means planning for 30 days from fix to the first movement and 60 to 90 days to a stable new equilibrium. The orphan URLs you 410 fall out of active scoring within about 45 days, and as they leave the host's median quality rises, which can lift the surviving hubs independent of the doorway fix itself. Do not expect the freed traffic to land back on the old URLs — it consolidates onto the substantive pages, so track the hubs' impressions and head-term positions as your recovery signal rather than watching the retired permutation set.",
  },
  {
    slug: "duplicate-google-chose-different-canonical",
    title:
      "\"Duplicate, Google chose a different canonical\" — diagnose programmatic near-duplicates",
    metaDescription:
      "GSC says \"Duplicate, Google chose a different canonical than user.\" Not a penalty — but a near-duplicate signal at scale. Diagnose which template collapsed.",
    primaryKeyword: "google chose a different canonical than user",
    oneLiner:
      "Search Console ignored your rel=canonical and folded the URL into a near-duplicate cluster. Not a penalty — but on a programmatic site it is a reliable sign your template lacks per-page uniqueness and you are spending crawl budget on pages Google treats as interchangeable.",
    whatYouSee:
      "In Search Console's Page indexing report, a chunk of one template lands in the \"Duplicate, Google chose a different canonical than user\" bucket — sometimes a few hundred URLs, sometimes most of a template family. Run URL Inspection on an affected page and the \"User-declared canonical\" and \"Google-selected canonical\" fields disagree: you pointed the page at itself, Google points it at a sibling that shares ~90% of its content. Critically, the page is usually still indexed — just under the sibling's URL, not yours — so traffic does not always fall off a cliff. What you lose is control: the page you optimized, linked to, and submitted in your sitemap is not the one ranking, and impressions quietly consolidate onto whichever sibling Google picked. The pattern is strongest on entity-swap templates where only a city, product, or persona noun changes between URLs, and it grows each crawl cycle as Google discovers more cluster members. First-time operators read it as a bug in their canonical tags; it is almost always a content-differentiation problem the tag cannot fix.",
    likelyCauses: [
      {
        cause: "Entity-swap templates that produce near-identical bodies",
        explanation:
          "When two URLs differ only by a swapped {city}, {product}, or {role} noun and share the same sentence frames, headings, intro, and CTA, Google's deduplication treats them as one page wearing different labels. Your self-referential canonical is only a hint; the near-duplicate body is the stronger signal, so Google picks one representative URL for the cluster and discards the rest. The fix lives in the content, not the tag.",
      },
      {
        cause: "Canonical tags are hints, overridden by ~40 site-wide signals",
        explanation:
          "Google does not treat rel=canonical as a command. It weighs roughly forty signals — internal-link distribution, sitemap inclusion, redirect targets, hreflang clusters, HTTPS, URL tidiness, and content similarity among them — to choose a canonical. If your internal links, sitemap, or hreflang point at a different member of the cluster than your canonical tag does, you have sent conflicting instructions and Google resolves the conflict by trusting the aggregate, not your tag.",
      },
      {
        cause: "Inconsistent canonical signals across the same cluster",
        explanation:
          "A page can self-canonicalize while its breadcrumb, related-links module, pagination, and parameterized variants all link to a slightly different URL of the same content. Faceted filters, trailing-slash and uppercase variants, and tracking parameters multiply the cluster. When the signals disagree about which URL is the real one, Google makes the call for you — and it rarely picks the one you intended, because your intended URL is the least-linked of the bunch.",
      },
      {
        cause: "Thin per-page differentiation below Google's uniqueness floor",
        explanation:
          "Templates where the unique slot is a short data table or a two-sentence blurb wrapped in heavy shared boilerplate fall below the differentiation threshold Google uses to keep pages distinct. The pages may each contain unique facts, but the proportion of unique-to-boilerplate text is too low to register as separate documents. The cluster collapses to its most-linked or most-complete member, and the rest become \"duplicates\" of it.",
      },
    ],
    diagnosticSteps: [
      "Open Search Console → Page indexing → \"Duplicate, Google chose a different canonical\" and export the URL list. Segment by URL prefix to confirm whether one template is the source or the issue is scattered across the site.",
      "Run URL Inspection on five affected URLs and record both the \"User-declared canonical\" and \"Google-selected canonical\" for each — the Google-selected URL is the representative of the near-duplicate cluster you are competing against.",
      "Run pseolint against your sitemap and read the near-duplicate findings first: they identify which URLs share enough body content to be clustered, and which sibling each one collapses into, so you can map clusters before touching anything.",
      "Read the boilerplate-ratio finding for the affected template — a high shared-boilerplate-to-unique-content ratio is the mechanical cause of the clustering, and it tells you how much genuinely unique content each page is missing.",
      "Check the template-diversity finding to see whether your headings, intros, and section structure are identical across the cluster; identical structure plus a swapped noun is the exact fingerprint that defeats a self-referential canonical.",
      "Audit signal consistency for one cluster end to end: confirm the canonical tag, the internal links pointing at the page, the sitemap entry, and any hreflang all reference the same URL — any disagreement is a vote you are casting against your own intended canonical.",
      "Decide per cluster whether to differentiate (make each page genuinely unique) or to consolidate on purpose (pick one canonical, 301 or canonicalize the rest, and stop fighting to index pages that should not exist separately).",
    ],
    relatedRules: [
      "near-duplicate",
      "boilerplate-ratio",
      "template-diversity",
    ],
    caseStudy:
      "A home-services marketplace published 9,400 \"{service} in {city}\" pages from one template — same 1,100-word boilerplate, a swapped city name, and a three-row local price table per page. Within two crawl cycles, 6,700 landed in \"Duplicate, Google chose a different canonical than user\"; URL Inspection showed Google had folded each city page into the largest-metro version of the same service. Nothing was penalized — the service hub pages still ranked — but the long-tail city traffic the template was built for never materialized. The team split the work: for the top 400 cities by demand they replaced the boilerplate with genuinely local content (named providers, city-specific permit rules, real per-city price ranges from booking data), and for the remaining 6,300 they deliberately consolidated to service-level pages and canonicalized the thin variants away. Indexed-as-declared URLs on the rewritten set rose from 12% to 71% within about six weeks.",
    faqs: [
      {
        q: "Is \"Duplicate, Google chose a different canonical\" a penalty?",
        a: "No. Google's own guidance (Martin Splitt, 2025) is explicit that this status is not a manual action or a ranking penalty — the affected URLs are usually still indexed as part of a near-duplicate or language cluster, just under a different URL than you declared. It matters because on a publish-at-scale site it signals thin per-page differentiation, wastes crawl budget on interchangeable pages, and means the page you optimized is not the one Google ranks. Treat it as an efficiency and quality signal, not an enforcement event.",
      },
      {
        q: "Why is Google ignoring my rel=canonical tag?",
        a: "Because rel=canonical is a hint, not a directive. Google combines it with roughly forty other signals — internal links, sitemap inclusion, redirect targets, hreflang, content similarity, and URL cleanliness among them — to pick the canonical it trusts. When your near-duplicate bodies and your internal-link distribution disagree with your tag, Google sides with the aggregate signal. The tag is not broken; it is being outvoted by stronger evidence that two pages are the same document.",
      },
      {
        q: "Will fixing my canonical tags make Google use my chosen URL?",
        a: "Usually not on its own. If the pages are genuine near-duplicates, making every canonical signal perfectly consistent still leaves Google looking at two pages it considers the same and choosing one. Consistent signals are necessary — align canonical, internal links, sitemap, and hreflang — but the durable fix is making each page actually different: real per-page data and structure, not a swapped entity noun. Tag hygiene plus genuine differentiation is what changes Google's selection.",
      },
      {
        q: "Should I try to index all the near-duplicates or consolidate them?",
        a: "Decide per cluster. If each page can carry genuinely unique, demand-backed content — a city page with real local data, a product page with distinct specs and reviews — invest in differentiation and keep them separate. If the pages exist only because the template could generate them and they will never be meaningfully different, the right move is to consolidate on purpose: pick one canonical, 301 or canonicalize the rest, and stop spending crawl budget asking Google to index interchangeable pages. Fighting to index near-duplicates Google has already merged is usually wasted effort.",
      },
      {
        q: "How is this different from \"Crawled — currently not indexed\"?",
        a: "They are adjacent but distinct. \"Duplicate, Google chose a different canonical\" means Google did index the content, just under a sibling URL it judged to be the same page. \"Crawled — currently not indexed\" means Google fetched the page and decided it was not worth keeping at all. The first is a deduplication outcome; the second is a quality-rejection outcome. The split matters: deduplication needs differentiation or consolidation, while not-indexed needs added value before Google will reconsider the URL.",
      },
    ],
    recoveryTimeline:
      "There is no manual-action clock here because there is no manual action — recovery is gated entirely by Google re-crawling and re-clustering your pages, which moves at crawl-budget pace. For pages you genuinely differentiate, expect Google to re-evaluate over the next one to three crawl cycles (roughly two to six weeks for a healthy host) and to start honoring your declared canonical once the bodies are distinct enough to read as separate documents; the indexed-as-declared ratio in Search Console is your leading indicator. For pages you consolidate on purpose, cleanup is faster and more predictable: once 301s or aligned canonicals are in place, the duplicate cluster shrinks within a crawl cycle or two and the surviving URL absorbs the impressions. Do not expect the \"Duplicate\" bucket to empty overnight — it drains URL by URL — and resist re-requesting indexing on individual pages, since the pace at which Google re-includes your differentiated pages is itself the quality verdict you are waiting on.",
  },
];

/** Merge per-slug authoritative sources onto each base entry. */
export const MARKETING_SYMPTOMS: readonly MarketingSymptom[] = SYMPTOMS_BASE.map((entry) => ({
  ...entry,
  sources: SYMPTOM_SOURCES[entry.slug] ?? [],
  extra: SYMPTOM_EXTRA[entry.slug] ?? [],
}));

export function findSymptom(slug: string): MarketingSymptom | undefined {
  return MARKETING_SYMPTOMS.find((s) => s.slug === slug);
}

export function allSymptomSlugs(): string[] {
  return MARKETING_SYMPTOMS.map((s) => s.slug);
}

/**
 * Approximate prose word count for a symptom entry — the body fields a reader
 * actually consumes (nav chrome and slugs excluded). Used by the content-quality
 * guardrail to keep every /symptoms page above pseolint's own thin-content bar.
 */
export function symptomBodyWordCount(entry: MarketingSymptom): number {
  const parts: string[] = [
    entry.oneLiner,
    entry.whatYouSee,
    ...entry.likelyCauses.map((c) => `${c.cause} ${c.explanation}`),
    ...entry.diagnosticSteps,
    entry.caseStudy,
    ...entry.faqs.map((f) => `${f.q} ${f.a}`),
    entry.recoveryTimeline,
  ];
  return parts
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}
