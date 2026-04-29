/**
 * Marketing-symptom catalog. Each entry powers a public /symptoms/[slug] page
 * that targets a bottom-funnel diagnostic query (e.g. "lost rankings after
 * google update"). Voice: senior SEO consultant, 2 a.m. tone — calm, specific,
 * actionable. Each entry is uniquely written; no shared phrasing or templates.
 *
 * Word target: ~600-800 of body content per symptom (intro + causes + steps +
 * case + faqs + recovery), excluding nav chrome.
 */

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
}

export const MARKETING_SYMPTOMS: readonly MarketingSymptom[] = [
  {
    slug: "lost-rankings-after-google-update",
    title: "Lost rankings after a Google update — diagnose what tripped SpamBrain",
    metaDescription:
      "Pinpoint why your programmatic-SEO site lost rankings after a Google core or spam update. Run a SpamBrain risk audit and get a fix list ordered by impact.",
    primaryKeyword: "lost rankings after google update",
    oneLiner:
      "Site-wide drop in positions across most or all programmatic templates the day a Google core or spam update finished rolling out.",
    whatYouSee:
      "Your Search Console position chart looks fine for weeks, then on a single day — usually two to ten days into an announced rollout — average position falls off a cliff and impressions follow within forty-eight hours. The drop is not concentrated on one URL; it's distributed across a template family. Your top-ten money pages survive (they have backlinks and engagement signals), but the long tail of generated pages loses three to twelve positions and the impressions stop arriving. Clicks lag impressions because the SERP cache is slower to update than ranking. By the end of the rollout window the site looks visibly thinner in third-party rank trackers, and competitors with smaller programmatic footprints have moved up to fill the gap.",
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
      "Search Console's Page indexing report shows a stair-step drop in indexed URLs — sometimes 30% in a week, sometimes 80% in a single day. The corresponding rise lands in two buckets: \"Crawled — currently not indexed\" (Google fetched the page and decided it wasn't worth keeping) and \"Discovered — currently not indexed\" (Google saw the URL in your sitemap but didn't bother to crawl). Traffic does not always drop one-for-one, because the deindexed URLs were often long-tail pages that contributed impressions but few clicks. The leading indicator most operators miss is the Discovered bucket growing first; deindexation follows two to three weeks later when Google re-evaluates what it already has.",
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
      "An e-commerce marketplace lost 47,000 indexed product pages over three weeks. The audit traced it to a template change that began emitting rel=canonical pointing to the parent category for any product with fewer than three reviews — meant as a quality signal, read by Google as \"these pages are duplicates.\" The fix was a one-line template revert. Indexation recovered to 80% within two crawl cycles (about ten days) without any content changes.",
    faqs: [
      {
        q: "How fast does deindexation reverse once I fix the cause?",
        a: "For technical causes (canonical, robots, soft 404), recovery starts within the next crawl cycle — typically two to seven days for high-priority hosts. For quality causes, recovery is gated by Google's willingness to re-crawl and re-evaluate, which can take four to twelve weeks.",
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
      "Technical-cause recoveries land within one to three crawl cycles — typically a week for high-traffic sites, three weeks for low-traffic sites — once Google re-fetches affected URLs and confirms the issue is gone. Quality-cause recoveries require both your fixes shipping and Google's quality re-evaluation, which is gated to roughly the cadence of core updates. Expect a partial re-indexation within thirty days if you've trimmed the sitemap aggressively, and full recovery (or a stable new equilibrium) within ninety days. Watch the Discovered-to-Indexed conversion rate as your leading indicator: when it climbs above 80%, your sitemap is back in good standing.",
  },
  {
    slug: "site-reputation-abuse-penalty",
    title: "Site reputation abuse penalty — diagnose third-party content risk",
    metaDescription:
      "Site reputation abuse demotes pages where third-party content lives on a trusted domain. Diagnose your exposure before Google or a manual action gets there first.",
    primaryKeyword: "site reputation abuse penalty",
    oneLiner:
      "Targeted demotion or manual action against a subdirectory or subdomain hosting third-party content that exploits the host domain's reputation.",
    whatYouSee:
      "Unlike a sitewide drop, this presents as a surgical strike: one subdirectory (frequently /coupons/, /reviews/, /best/, /casino/, /loans/, or a partner-content subfolder) loses 70-100% of its traffic in a discrete event, while the rest of the site is untouched. If a manual action has been issued, you'll see it in Search Console under Security & Manual Actions with the description \"Third-party content abuse.\" If it's algorithmic, there's no notification — the drop just happens, usually within forty-eight hours of a public Google announcement about site reputation abuse enforcement. The remaining giveaway is that the affected subfolder's URLs lose impressions across all queries simultaneously, not just commercial ones.",
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
      "Run pseolint on the affected subfolder — the spam/template-coverage, spam/template-diversity, content/missing-author, and content/eeat-signals findings will quantify how machine-generated and unsigned the content reads.",
      "Verify byline accuracy and editorial oversight: does each page have a real author who actually reviewed it, or is the byline a partner brand or a generic \"Editorial Team\"?",
      "Decide per-arrangement: end the partnership, move the content to a separate subdomain or domain owned by the partner, or invest enough first-party editorial review to credibly own the content. There is no fourth option.",
      "Document the editorial process for any third-party content you keep — the documentation matters both for reconsideration requests and for surviving the next enforcement wave.",
    ],
    relatedRules: [
      "template-diversity",
      "near-duplicate",
      "doorway-pattern",
      "boilerplate-ratio",
    ],
    caseStudy:
      "A regional newspaper hosted /coupons/ as a revenue-share partnership with a national coupon syndicator — 14,000 URLs, ~12% of total organic traffic. After a March 2024 manual action for site reputation abuse, the publisher migrated the coupon content to a subdomain owned by the partner (coupons.partner.com), 301-redirected the old URLs, and applied for reconsideration. The manual action was lifted in twenty-three days; the rest of the site never lost traffic. Coupon revenue dropped to roughly 30% of prior levels because the subdomain didn't inherit the publisher's authority — which was the point of the enforcement.",
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
      "Manual-action timelines are bounded: reconsideration requests are typically reviewed within two to four weeks of submission, and the action is lifted as soon as Google's reviewer agrees the underlying practice has ended. Algorithmic demotions take longer because there's no human in the loop — the demotion lifts when Google's next crawl confirms the third-party content is genuinely gone or restructured. Plan for thirty days from fix to algorithmic lift, sixty days from fix to traffic stabilization on the subfolder. If you noindex rather than restructure, the subfolder may never recover; it stops being a liability but it also stops being an asset. Revenue forecasting should assume the affected subfolder operates at 20-40% of its pre-enforcement contribution permanently.",
  },
  {
    slug: "traffic-drop-no-update",
    title: "Organic traffic drop with no algorithm update — diagnose the silent regression",
    metaDescription:
      "Organic traffic dropped but no Google update was announced. Diagnose silent technical regressions, ranking decay, and demand shifts before assuming the worst.",
    primaryKeyword: "organic traffic drop no algorithm update",
    oneLiner:
      "Meaningful organic decline (typically 15-40%) over a few days or weeks with no announced Google update to anchor the cause to.",
    whatYouSee:
      "Your performance chart shows a noticeable downward trend — sometimes a sharp step, more often a steady erosion over two to six weeks. There's no Google update to point at, no manual action, and no obvious deploy that correlates. Impressions are usually the first to fall; clicks follow. Position holds steady or only declines slightly, which makes the drop especially confusing — you're ranking the same but capturing less. Brand queries are stable, which rules out a brand-perception event. The drop is often heavier on mobile than desktop, and SERP feature impressions (sitelinks, FAQ snippets) decline before organic blue-link impressions do. Most teams misdiagnose this as a vague \"algorithm thing\" when the cause is usually mechanical and findable.",
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
      "A SaaS comparison site lost 32% of organic traffic over five weeks with no announced Google update and no obvious deploy. Investigation found a CDN configuration change had introduced a 301 from /vs/{a}/{b} to /vs/{a}-{b} for normalization, but the canonical tag was still pointing at the old URL pattern. Google was crawling the new URLs, finding canonicals to URLs that 301'd back, and incrementally pruning the affected template from active scoring. Reverting the canonical to self-referential restored traffic to baseline within ten days.",
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
      "Recovery time tracks the cause directly, not a fixed clock. Technical regressions reverse in days to weeks once the root config is restored — Google re-crawls, reconciles canonicals, and rankings stabilize within one to three crawl cycles. SERP-feature losses (AI Overviews, snippet displacements) don't \"recover\" — they require a content strategy that produces results AI can't summarize, which is a content investment over months. Demand-side drops recover when demand recovers, which you cannot influence directly. The most common operator mistake is to ship aggressive content changes within seven days of noticing the drop and then attribute the natural variance back upward to the changes; resist this for two to three weeks so you can actually attribute cause and effect.",
  },
  {
    slug: "thin-content-warning-search-console",
    title: "Thin content warning in Search Console — diagnose and fix the template-level signal",
    metaDescription:
      "A thin-content warning in Search Console flags low-value pages that drag your whole site. Diagnose which template tripped it and decide what to rewrite, consolidate, or noindex.",
    primaryKeyword: "thin content warning google search console",
    oneLiner:
      "Search Console flags or correspondence indicating that a meaningful portion of your indexed pages provide little unique value to users.",
    whatYouSee:
      "The explicit warning is rare — most teams encounter \"thin content\" as a diagnosis rather than a Search Console notification. What you actually see is a combination of signals: a growing \"Crawled — currently not indexed\" bucket concentrated on one template, a slowly declining indexed-URL count, individual URL inspections returning \"URL is not on Google\" with no other reason given, and gradual position decline on long-tail queries served by template-generated pages. If you do receive a manual action, it appears under Security & Manual Actions as \"Thin content with little or no added value\" — which is the most operator-friendly signal Google sends, because it tells you exactly what to fix and gives you a reconsideration path.",
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
      "Run pseolint on your sitemap and prioritize spam/thin-content, spam/boilerplate-ratio, content/unique-value, and content/heading-uniqueness findings. Sort findings by template, not URL, to see which template is structurally thin versus incidentally thin.",
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
      "A jobs aggregator received a manual action for thin content covering 23,000 city-by-role pages. The pages averaged 180 words of unique content (job description excerpts) wrapped in 1,400 words of boilerplate (location info, related searches, generic career advice). The team consolidated to role-only pages (no city), kept 800 high-volume city-by-role pages with rewritten body copy that included local salary data and unique-to-the-city employer commentary, and 410'd the rest. The manual action was lifted on reconsideration nineteen days after submission; organic traffic recovered to 110% of pre-action levels within six months because the consolidated pages ranked better than the original split.",
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
      "Manual-action recovery is bounded by the reconsideration cycle: typically two to four weeks from submission to verdict. Algorithmic recovery from thin-content signals is slower because the signal is host-level and updates as Google re-evaluates your overall indexed set. Expect partial recovery within thirty days of shipping fixes — Google will re-crawl and re-classify the rewritten pages, and the noindexed pages will fall out of active scoring. Full recovery usually lands at the next core update, when Google's host-level quality models re-score domains. The most important thing to monitor is the indexed-URL trend: when it stabilizes or grows on the rewritten template, you're recovering. When it continues to decline, the rewrites haven't worked and the pages need substantive — not cosmetic — additional value.",
  },
] as const;

export function findSymptom(slug: string): MarketingSymptom | undefined {
  return MARKETING_SYMPTOMS.find((s) => s.slug === slug);
}

export function allSymptomSlugs(): string[] {
  return MARKETING_SYMPTOMS.map((s) => s.slug);
}
