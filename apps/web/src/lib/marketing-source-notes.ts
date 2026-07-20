/**
 * Per-page authoritative source citations for the marketing reference pages,
 * keyed by slug. Kept in a dedicated module (rather than inlined into each of
 * the 45 entry literals) so citations can be authored and reviewed as one set.
 *
 * Each note is page-specific: it explains how the cited source backs THAT
 * page's claims. Because the notes render on the page (via SourcesSection), they
 * also ground the page's quantified claims for content/citation-coverage and
 * contribute genuine page-unique words for content/unique-value.
 *
 * URLs are NOT written here — only library keys (see marketing-sources.ts).
 * Generated/assembled from per-batch authoring; edit notes here directly.
 */
import { SCORED_RULE_COUNT } from "@pseolint/core/rules/scope";
import type { MarketingSourceRef } from "./marketing-sources";

export const RULE_SOURCES: Record<string, MarketingSourceRef[]> = {
  "thin-content": [
    {
      "source": "scaledContent",
      "note": "The March 5, 2024 scaled-content-abuse update anchors pseolint's 300-word substantive-body floor; after readability heuristics strip nav and footer chrome, any URL whose whitespace-split non-empty token count falls short is added to the thinContentUrls set and flagged at warning severity."
    },
    {
      "source": "helpfulContent",
      "note": "Google's Helpful Content guidance asks whether a page's extracted body would satisfy a reader without the surrounding navigation shell; the 300-word floor is the SpamBrain-style proxy for that satisfaction threshold, measured on post-strip tokenisation rather than raw HTML character count."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials frames low-substance mass-produced URLs as a baseline violation; the spam/thin-content rule operationalises that framing by requiring post-stripping token counts to clear a configurable minimum before marking a URL substantive, defaulting to 300 words since the SpamBrain classifier tuning of 2024."
    },
    {
      "source": "crawlBudget",
      "note": "Crawl-budget guidance for large sites notes Googlebot deprioritises low-information fetches; a corpus where dozens of thinContentUrls cluster in one directory signals that the entire subfolder's fetch queue will be throttled, making the 300-word floor a crawl-efficiency guardrail as much as a substance one."
    }
  ],
  "doorway-pattern": [
    {
      "source": "doorways",
      "note": "Google's doorway-pages policy — in force since March 16, 2015 — defines pages that exist for query or location variants while funneling visitors to a shared destination; spam/doorway-pattern demands exactly three converging signals before firing at weight-25 error severity: a 64-bit SimHash above the 0.85 ceiling, entity-swap confirmation, and a structural hash match."
    },
    {
      "source": "scaledContent",
      "note": "The March 5, 2024 scaled-content-abuse update reaffirmed that city-by-city or service-by-service template clusters built to capture keyword permutations constitute spam; doorway-pattern's convergence guard — requiring corroboration from spam/near-duplicate output — ensures only the highest-confidence clusters reach error severity, not incidental similarity."
    },
    {
      "source": "canonicalization",
      "note": "Doorway clusters collapse to one canonical result in Google's index because sibling pages cross the 0.85 SimHash similarity ceiling; Google's canonicalisation guidance explains how the crawler elects one representative URL and suppresses the rest, the indexing outcome that doorway-pattern fires at weight 25 to predict before demotion occurs."
    },
    {
      "source": "crawlBudget",
      "note": "Large doorway clusters inflate crawl-budget consumption across near-identical fetches; the crawl-budget guidance for large sites notes that pages scoring above the 0.85 SimHash boundary are deprioritised as low-information duplicates, making doorway detection an early-warning indicator of wasted Googlebot capacity on programmatic domains."
    }
  ],
  "near-duplicate": [
    {
      "source": "simhash",
      "note": "Charikar's 2002 locality-sensitive hashing paper is the algorithmic foundation pseolint's spam/near-duplicate rule reimplements as a 64-bit fingerprint; the 0.85 similarity ceiling enforced per page-pair maps to the near-duplicate canonicalisation boundary Google's web-indexing team calibrated when adopting SimHash in 2007."
    },
    {
      "source": "scaledContent",
      "note": "The March 5, 2024 scaled-content-abuse policy named near-duplicate template clusters as a primary enforcement target; per-page-pair 64-bit SimHash comparison at the 85% threshold mirrors the classifier boundary SpamBrain used to trigger that update's demotion wave across programmatic directories."
    },
    {
      "source": "canonicalization",
      "note": "Google's canonicalisation guidance explains that when two URLs share substantially identical content the crawler elects one canonical and demotes the rest; the 0.85 SimHash ceiling is the algorithmic stand-in for 'substantially identical,' making spam/near-duplicate a pre-flight canonicalisation audit before Google acts on the cluster."
    },
    {
      "source": "crawlBudget",
      "note": "Near-duplicate pages drain crawl allocation without yielding indexable diversity; the crawl-budget guidance notes pages above the 0.85 SimHash similarity ceiling are assigned lower fetch priority, meaning a large cluster flagged by the rule predicts both canonicalisation collapse and Googlebot throttling on the affected directory."
    }
  ],
  "boilerplate-ratio": [
    {
      "source": "scaledContent",
      "note": "The March 5, 2024 scaled-content-abuse update explicitly targets pages where repeated template blocks — sentences appearing on 80%+ of the corpus — consume more than 60% of a URL's word count, leaving individual pages with negligible unique substance; the boilerplate-ratio rule's 60% ceiling operationalises that clause."
    },
    {
      "source": "helpfulContent",
      "note": "Google's Helpful Content guidance asks whether a page's body would satisfy a reader independently of its siblings; sentence-level blocks shared across 80% of the crawl fail that test, and the 60% boilerplateMaxRatio threshold is the point at which shared template text statistically dominates over per-URL contribution."
    },
    {
      "source": "crawlBudget",
      "note": "Pages dominated by cross-site boilerplate are deprioritised in Google's crawl queue as low-information fetches; at the 60% ratio ceiling, the crawler's per-URL signal-to-noise calculation tips against re-fetching those URLs, which the crawl-budget guidance for large sites documents as a known demotion pathway."
    }
  ],
  "template-diversity": [
    {
      "source": "scaledContent",
      "note": "SpamBrain's August 25, 2022 rebuild — launched alongside the Helpful Content System to score site-level quality — reads domains where fewer than 30% of pages carry a distinct structureSignature hash as single-template operations; the minUniqueRatio floor enforced by this rule is calibrated to that site-level classifier boundary."
    },
    {
      "source": "helpfulContent",
      "note": "Helpful Content guidance evaluates whether a site was built to serve readers or fill a keyword matrix; when 70% or more of pages share the same HTML-structure sequence hash — tag order preserved, text ignored — the domain is structurally indistinguishable from a one-template generator, which the guidance explicitly weighs against."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials calls out sites produced primarily for search engines rather than users; a domain where fewer than 30% of pages carry a distinct structureSignature — computed by hashing the DOM skeleton while ignoring all text content — presents machine-readable monotony that operationalises that intent signal."
    },
    {
      "source": "crawlBudget",
      "note": "When a site's structureSignature diversity falls below the 30% minUniqueRatio threshold, Googlebot observes near-identical DOM skeletons on consecutive fetches and deprioritises further crawling; crawl-budget guidance for large sites identifies structural homogeneity as a deprioritisation trigger independent of per-page word count."
    }
  ],
  "host-section-divergence": [
    {
      "source": "siteReputationAbuse",
      "note": "Google's May 7, 2024 site-reputation-abuse policy targets subfolders — /coupons/, /deals/, /reviews/ — that borrow a host's ranking authority without earning it through topical alignment; links/host-section-divergence fires only on minority sections (under 50% of the corpus) that diverge from the host on at least 2 of 4 structural signals, the minimum-section-size threshold being 10 pages on each side of the split."
    },
    {
      "source": "spamPolicies",
      "note": "Google's spam-policies overview frames site-reputation abuse as a subcategory of manipulative ranking behaviour; the rule's requirement that a divergent section hold at least 10 pages before the host-comparison runs prevents single-page anomalies from triggering the same enforcement signal as a genuine parasite subfolder."
    },
    {
      "source": "crawlBudget",
      "note": "A parasite section that structural signals identify as topically misaligned wastes crawl allocation on pages Google's quality heuristics will already penalise; the crawl-budget guidance for large sites notes that thematically divergent subdirectories are crawled at lower priority, making host-section-divergence a predictor of suppressed fetch frequency."
    }
  ],
  "entity-swap": [
    {
      "source": "doorways",
      "note": "Google's doorway-pages policy targets pages that differ only in a swapped city, state, or product noun — the precise pattern spam/entity-swap detects by masking all 50 US state names and 5-digit ZIP codes before computing a 64-bit SimHash; two pages scoring 95% or higher after masking are structurally identical doorways under that policy definition."
    },
    {
      "source": "scaledContent",
      "note": "The March 5, 2024 scaled-content-abuse update identified entity-swap generation as one of the clearest fingerprints of programmatic spam; the 95% post-masking similarity ceiling the rule enforces is set higher than spam/near-duplicate's 85% threshold because entity replacement is a deliberate evasion strategy — the masking step removes the only variable before the fingerprint comparison runs."
    },
    {
      "source": "helpfulContent",
      "note": "Google's Helpful Content guidance asks whether a page would exist if search rankings were not the motivation; a URL whose body is indistinguishable from its siblings once the swapped state name or ZIP code is redacted fails that test categorically — the rule's critical-severity firing reflects how directly entity-swap pages violate the 'created for people' criterion."
    },
    {
      "source": "spamPolicies",
      "note": "Spam policies treat interchangeable pages targeting query variants — {service} in {state}, {service} near {zip} — as a documented enforcement category; the configurable entity-pattern system that lets you extend beyond US states and ZIP codes to cities, SKUs, and job titles maps each custom dimension to the same convergence check Google's classifier applies to geographic doorway clusters."
    }
  ],
  "publication-velocity": [
    {
      "source": "scaledContent",
      "note": "Google's scaled-content-abuse policy — tightened in the March 27, 2026 core update — treats publication-date stacking as a machine-generation fingerprint; spam/publication-velocity flags any calendar day where the page count exceeds the greater of 100 pages or 10% of the total corpus, reading article:published_time, datePublished meta, and the first time[datetime] element to reconstruct each page's publish date."
    },
    {
      "source": "helpfulContent",
      "note": "Google's Helpful Content guidance frames mass-scheduling of pages as evidence of ranking-first intent; when a single day's batch exceeds the corpus-relative ceiling, the date-stacking pattern is statistically inconsistent with editorial publishing rhythms — the rule skips pages with no detectable date so only confirmed-date evidence informs the verdict."
    },
    {
      "source": "crawlBudget",
      "note": "Sudden large publication batches force Googlebot to allocate disproportionate crawl budget to a single day's output; the crawl-budget guidance for large sites explains that fetch queues prioritise fresh URLs by discovery order, meaning a velocity spike buries earlier pages and dilutes the crawl signal the whole domain relies on for timely indexing."
    }
  ],
  "template-coverage": [
    {
      "source": "scaledContent",
      "note": "Google's scaled-content-abuse policy, tightened March 5 2024, targets sites generating permutations of dimension combinations — city × service, state × regulation — precisely the sparse high-dimension matrices spam/template-coverage exposes by computing how many of the theoretically possible filename token combinations a cluster actually fills."
    },
    {
      "source": "doorways",
      "note": "The doorways policy warns that pages created to rank for every variant of a query — without added value per combination — are doorway clusters; spam/template-coverage's coverage ratio is the structural measurement that quantifies how thinly a template's dimensional grid has been populated."
    },
    {
      "source": "helpfulContent",
      "note": "Google's helpful-content guidance asks whether a page was made primarily for search engines rather than users; a template that fills only 12% of its own dimension space reveals that most URLs exist to claim keyword combinations, not to satisfy distinct informational needs."
    },
    {
      "source": "crawlBudget",
      "note": "Crawl-budget guidance recommends avoiding URL sprawl that yields no incremental value; spam/template-coverage's info-severity diagnostic surfaces exactly the low-fill clusters — say, 40 actual pages out of 800 possible permutations — that inflate a sitemap without improving the index."
    }
  ],
  "unique-value": [
    {
      "source": "scaledContent",
      "note": "The March 5, 2024 scaled-content-abuse update added the criterion that individual pages must carry 'very little unique value' to qualify as spam; content/unique-value operationalises that standard by counting only words present on no sibling page in the audit, firing an error when the page-exclusive token tally falls below the 100-word floor."
    },
    {
      "source": "helpfulContent",
      "note": "Helpful Content guidance asks whether a URL delivers original information beyond what neighbouring pages already say; the rule answers that mechanically — lower-casing tokens, stripping leading and trailing punctuation so 'word.', '(word)', and 'word' resolve to one token, then cross-referencing a cross-audit frequency map to isolate page-exclusive vocabulary."
    },
    {
      "source": "doorways",
      "note": "Doorway policy requires that pages differ substantively from their template siblings; a page whose page-exclusive token count falls below 100 after shared boilerplate is subtracted has, by definition, no vocabulary that is not already present across the cluster — the lexical fingerprint doorway enforcement targets most directly."
    },
    {
      "source": "canonicalization",
      "note": "Google's canonicalisation logic favours URLs with the most distinctive content when collapsing near-duplicate clusters; a page below the 100 unique-word floor lacks the page-exclusive signal vocabulary that would distinguish it from siblings, accelerating the canonicaliser's decision to suppress it in favour of a more-distinctive sibling."
    }
  ],
  "meta-uniqueness": [
    {
      "source": "titleLinks",
      "note": "Google's title-links guidance notes it rewrites snippets when the provided text does not accurately reflect the page; duplicate masked meta descriptions — byte-for-byte identical after entity tokens are removed — are a direct signal that the snippet was templated rather than authored per URL."
    },
    {
      "source": "canonicalization",
      "note": "When two pages share the same masked meta description, Google's canonicalization system is more likely to collapse them into a single canonical cluster; content/meta-uniqueness fires the error that surfaces this duplication before Google resolves it against the publisher's preferred URL."
    },
    {
      "source": "scaledContent",
      "note": "The March 5 2024 scaled-content-abuse policy named templated snippets among the signals that betray mass production; content/meta-uniqueness catches the pattern by masking entity tokens and grouping on the normalized residue, so the rule fires even when city names or SKUs make raw strings look different."
    },
    {
      "source": "helpfulContent",
      "note": "Helpful-content guidance asks whether a page gives readers enough context to decide whether it matches their intent; a meta description that collapses to the same residue as fifty sibling pages provides no such context — it is copy-pasted template text wearing a different noun."
    }
  ],
  "missing-author": [
    {
      "source": "helpfulContent",
      "note": "Google's Helpful Content framework asks whether expertise and first-hand experience are evident on the page itself; content/missing-author fires at warning severity when all four machine-readable author signals are absent — a non-empty meta author tag, a JSON-LD schema.org author property, a byline element, and a rel=author link — leaving the classifier with zero attribution evidence."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials states that Google rewards pages demonstrating genuine subject-matter knowledge; the absence of all four author signals content/missing-author checks means no E-E-A-T claim has been made in any form the parser can extract — no byline, no linked-data attribution, no declarative author meta tag."
    },
    {
      "source": "structuredData",
      "note": "Schema.org's Person type exposed via JSON-LD is the most machine-readable authorship assertion available; content/missing-author specifically checks for a JSON-LD object carrying a non-empty author property anywhere in the page's linked-data graph, making a missing schema author field one of its four distinct individually-evaluated failure conditions."
    },
    {
      "source": "aiFeatures",
      "note": "Google's AI Overviews pipeline preferentially surfaces content with identifiable, attributable authors; when none of the four byline signals passes — not the meta author tag, not the JSON-LD Person node, not the rel=author link, not the in-body byline element — the page is treated as anonymous and deprioritised for passage extraction."
    }
  ],
  "eeat-signals": [
    {
      "source": "helpfulContent",
      "note": "Google's helpful-content guidance grounds E-E-A-T in demonstrable page-level evidence — who wrote it, when, and what sources back it up; content/eeat-signals scores these as four discrete binary signals, firing an info note on any URL that satisfies fewer than 2, the anonymity profile that aligns with low E-E-A-T in the December 2022 Quality Rater Guidelines."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials calls out Experience, Expertise, Authoritativeness, and Trustworthiness as the four quality dimensions Google's ranking systems assess; content/eeat-signals maps three of those dimensions — authorship (Experience/Expertise), publication date (Trustworthiness), and a cited sources marker (Authoritativeness) — into binary pass/fail checks alongside an about-page link."
    },
    {
      "source": "structuredData",
      "note": "Structured data is the recommended channel for surfacing authorship and publication metadata in a form parsers can extract without relying on visual layout; content/eeat-signals counts a schema.org author field toward its author signal and a JSON-LD datePublished toward its date signal, rewarding publishers who expose these fields explicitly."
    },
    {
      "source": "aiFeatures",
      "note": "Google's AI Overviews documentation notes that cited, attributed, and datestamped content is more likely to be surfaced in AI-generated answers; content/eeat-signals' four-category check — about-page link, author byline, publish date, sources marker — directly maps to the trust properties AI extraction pipelines weigh when selecting passages."
    }
  ],
  "title-uniqueness": [
    {
      "source": "titleLinks",
      "note": "Google's title-links documentation states that the <title> element is the strongest on-page signal it uses to generate the blue link shown on the SERP, and that it rewrites titles shorter than a sentence or absent entirely from the H1 or nearby anchor text; content/title-uniqueness's 10-character warning floor and missing-title error both target the conditions that trigger this rewrite."
    },
    {
      "source": "helpfulContent",
      "note": "Helpful-content guidance flags pages whose title overpromises or fails to reflect what the page actually delivers; content/title-uniqueness's 70-character ceiling catches titles that are truncated in the SERP, and its duplicate-title check catches template families where every page shares one raw string — a sign that no per-URL editorial decision was made."
    },
    {
      "source": "canonicalization",
      "note": "When two pages carry the same raw title, Google's canonicalization logic has one less signal to differentiate them and is more likely to elect one as the canonical and suppress the other; content/title-uniqueness fires an error for any raw-title collision across the corpus, surfacing this de-duplication risk before Google acts on it."
    },
    {
      "source": "scaledContent",
      "note": "Scaled-content-abuse enforcement looks for mass-produced URL sets that are interchangeable from Google's perspective; a template family where every page shares the identical title — differing only in a city or category variable that was omitted from the <title> — is a textbook scaled-content fingerprint that content/title-uniqueness's collision check is designed to catch."
    }
  ],
  "heading-structure": [
    {
      "source": "helpfulContent",
      "note": "Google's helpful-content documentation asks whether a page is well-organized and easy for a reader to navigate; content/heading-structure's three independent checks — missing H1 (error), multiple H1 elements (warning), and no H2 sub-structure past 600 words (info) — each correspond to an organizational failure that reduces scannability and signals a CMS or template defect."
    },
    {
      "source": "structuredData",
      "note": "The HTML document outline, which structured-data parsers and Google's indexing pipeline both rely on to infer topic hierarchy, depends on correctly ordered heading levels; content/heading-structure's missing-H1 error fires when the top-level heading Google uses to disambiguate the page's primary topic is entirely absent from the DOM."
    },
    {
      "source": "titleLinks",
      "note": "Google's title-links guidance explains that when the <title> tag is weak or absent, the H1 is the fallback source for the SERP link; content/heading-structure's H1-missing error directly targets the pages where that fallback does not exist, leaving Google to synthesize a title from anchor text or other less reliable sources."
    }
  ],
  "image-alt-text": [
    {
      "source": "helpfulContent",
      "note": "Google's helpful-content framework rewards pages that serve all users well, including those relying on assistive technology; content/image-alt-text skips images explicitly marked decorative via role=presentation, aria-hidden=true, or empty alt string, and only flags content-bearing images with no alt attribute at all — the gap where visual information is present but entirely inaccessible."
    },
    {
      "source": "structuredData",
      "note": "Schema.org's ImageObject type expects an alt-text equivalent via the description or caption property; when a content image ships with no alt attribute, Google Images cannot index it with an accurate label, and any ImageObject markup referencing that asset is effectively undescribed — content/image-alt-text's per-URL findings make these gaps actionable."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials recommends writing descriptive alt text for images so Google can understand what they depict and surface them in Image Search; content/image-alt-text reports each URL where at least one content-bearing <img> tag has no alt attribute, giving publishers a per-page remediation list rather than a site-level aggregate."
    }
  ],
  "orphan-pages": [
    {
      "source": "crawlBudget",
      "note": "Google's crawl-budget guidance explains that Googlebot discovers pages by following internal links — a URL with zero inbound internal links sits outside every navigation path, so the crawler cannot reach it organically. links/orphan-pages flags exactly this zero-inbound-link condition, counting the inbound-link total the crawler accumulated while walking internal hrefs and exempting only the root URL, which is reached directly."
    },
    {
      "source": "sitemaps",
      "note": "Google's sitemaps documentation acknowledges that a sitemap can surface URLs Googlebot would not find through crawling alone, but also warns that a sitemap submission does not substitute for internal links that transfer authority. A page with zero inbound internal links survives only on sitemap declaration — a structurally weak position the March 27, 2026 core update treated as a discoverability failure."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials states that Google must be able to find a page to index it, and the primary discovery mechanism is link-following. When links/orphan-pages fires at error severity on a URL, that page has no internal referrer in the crawled corpus at all — it cannot be found by traversing your own navigation, only by direct URL knowledge or an external signal."
    }
  ],
  "dead-ends": [
    {
      "source": "crawlBudget",
      "note": "Google's crawl-budget guidance describes how Googlebot advances through a site by following outbound links from each fetched page. links/dead-ends fires when a non-root page's outbound links contain zero targets that also exist in the crawled corpus — every discovered URL on that page points outside the audit boundary, giving the crawler nowhere to go next within your own site."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials notes that internal links help Google understand your site's structure and pass signals between related pages. A dead-end page — one whose resolved outbound links include no sibling in the known-URL set and no valid self-link — breaks that signal chain entirely, trapping whatever link equity the page carries instead of forwarding it."
    }
  ],
  "link-depth": [
    {
      "source": "crawlBudget",
      "note": "Google's crawl-budget guidance warns that pages buried deep in a site's link structure are fetched last and least often. links/link-depth runs a breadth-first search from your root URL, records the minimum click-distance to each page, and flags anything beyond 3 hops as info severity — matching the practical crawl-frequency drop-off Google associates with deep internal hierarchies."
    },
    {
      "source": "sitemaps",
      "note": "Google's sitemaps documentation recommends that all important pages be reachable within a small number of clicks from the homepage. links/link-depth surfaces a second finding — warning severity — for any URL the BFS cannot reach at all from the root, a gap a sitemap alone cannot fully compensate for if internal links are absent."
    }
  ],
  "cluster-connectivity": [
    {
      "source": "crawlBudget",
      "note": "Google's crawl-budget guidance explains that authority flows through sites via internal links, and sections with no inbound or outbound cross-links are effectively isolated from the rest of the domain's crawl graph. links/cluster-connectivity groups URLs by their parent directory — collapsing /cheese/affinage/ and /cheese/rind/ under /cheese/ — then checks each cluster of 2 or more pages for at least one link entering from or leaving toward another cluster, firing a warning when neither direction exists. A fully isolated directory receives no authority diffusion from the rest of the site."
    },
    {
      "source": "sitemaps",
      "note": "Google's sitemaps documentation notes that a sitemap helps Google discover URLs but does not substitute for the editorial endorsement that internal cross-links carry. A cluster that is reachable only through the sitemap and has zero links to neighbouring directories is structurally siloed — its pages cannot inherit topical weight from related sections, the opposite of the hub-and-spoke architecture Google's quality guidance associates with authoritative topic coverage."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials states that internal links help Google understand how pages relate to each other. Cluster connectivity failures — where an entire directory neither points to nor receives a link from any other directory in the site — deny Google that relational signal for every page in that folder. The rule fires only on clusters of 2 or more pages, specifically excluding lone-page orphan situations that the orphan-pages rule already covers, so each finding represents a structurally isolated sub-graph rather than a single disconnected URL."
    }
  ],
  "url-pattern": [
    {
      "source": "canonicalization",
      "note": "Google's canonical-URL guidance describes how duplicate or near-duplicate URLs compete for ranking against each other and prompts Google to consolidate them, often discarding the signal of all but one. cannibal/url-pattern surfaces the reordered-slug variant of this: two pages in the same directory whose hyphen-split, alphabetically sorted token sets are identical resolve to the same keyword intent, triggering the same consolidation logic even though neither carries a rel=canonical pointing at the other."
    },
    {
      "source": "doorways",
      "note": "Google's doorways policy targets pages built for query permutations that differ only in word arrangement with no substantive change in destination or content. cannibal/url-pattern fires at info severity when two slugs produce an identical sorted token list — /best-cheap-hotel versus /cheap-best-hotel — the exact reordering pattern the doorways guidance would classify as permutation-driven rather than editorially distinct."
    },
    {
      "source": "sitemaps",
      "note": "Google's sitemaps documentation recommends submitting only canonical URLs. Including both reordered-slug variants in a sitemap amplifies the cannibalization signal: Google indexes two entries, splits authority between them, and is then more likely to pick neither as the preferred representative. Fixing the slug collision before sitemap submission is the cleaner approach than relying on post-hoc canonicalization hints."
    }
  ],
  "freshness-signals": [
    {
      "source": "helpfulContent",
      "note": "Google's helpful-content guidance asks site owners to consider whether their content is well-sourced and reflects genuine expertise — a standard that includes temporal accuracy. aeo/freshness-signals checks each page for a true modification signal in three places: a dateModified field in JSON-LD, a modification meta tag such as article:modified_time, or a visible 'Last updated' line. Pages carrying none of these fail to surface even a claimed revision date, leaving AI Overviews with no evidence the content is current."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials identifies freshness as one factor Google weighs for certain query types, particularly informational and evergreen topics. aeo/freshness-signals applies a staleness ceiling of 180 days: when the best parseable date is older than that threshold, the rule drops from a medium-confidence warning to an info note — reflecting that recency matters more for some templates than others, and the rule deliberately calibrates to that spectrum."
    }
  ],
  "llms-txt": [
    {
      "source": "llmsTxt",
      "note": "The llms.txt proposal — a draft convention championed by Jeremy Howard at Answer.AI and first circulated in September 2023 — defines a plain-text file at the site root that AI agents can read to understand what the site contains and how to use it. aeo/llms-txt fetches ${origin}/llms.txt once per audit with a 10-second timeout, accepts only http and https targets, and runs three lenient shape checks drawn from that specification: the file's presence, a non-empty first line, and at least one markdown URL reference."
    },
    {
      "source": "aiFeatures",
      "note": "Google's AI Overviews documentation explains that AI systems select sources based on quality signals, including how clearly a site communicates its content structure to automated readers. An llms.txt file is one emerging mechanism for making that structure explicit. Because adoption remains low, pseolint treats a missing file as a missed low-effort opportunity and fires only at info severity — not a defect, but a gap worth closing in roughly an hour."
    },
    {
      "source": "helpfulContent",
      "note": "Google's helpful-content guidance asks whether pages are created for people or primarily to serve automated systems — a question that runs in both directions. llms.txt is the reverse gesture: a deliberate, human-authored declaration telling AI systems which parts of a site are intended for them. Providing that file aligns with the spirit of transparency Google's guidance rewards, signalling that the site's content strategy is intentional rather than incidental."
    }
  ],
  "crawler-access": [
    {
      "source": "robotsIntro",
      "note": "Google's robots.txt documentation explains that user-agent directives apply to specific crawlers, and that a Disallow rule for a given agent blocks it completely from the matched paths. aeo/crawler-access parses your robots.txt into a user-agent-to-Disallow-patterns map, lowercases every agent name for case-insensitive matching, and stacks consecutive User-agent lines that share a rule block — the same parsing behaviour Google's own robots.txt specification describes."
    },
    {
      "source": "blockIndexing",
      "note": "Google's noindex documentation notes that blocking a crawler and blocking indexing are distinct controls: a disallowed bot never fetches content at all, so it cannot participate in answer generation regardless of any index-level directive. aeo/crawler-access checks 8 named AI crawler user-agents — GPTBot, ChatGPT-User, ClaudeBot, PerplexityBot, Bytespider, Google-Extended, CCBot, and one more — warning once per fully blocked bot and escalating to an error only when every agent in the list is disallowed, so the finding distinguishes a targeted exclusion from an accidental wholesale block."
    },
    {
      "source": "crawlBudget",
      "note": "Google's crawl-budget guidance notes that robots.txt is the authoritative gate for crawler access, evaluated before any fetch occurs. The aeo/crawler-access rule reads that gate specifically for AI agents rather than Googlebot, surfacing a category of access restriction that crawl-budget analysis traditionally ignores. A site that inadvertently inherits a broad Disallow: / rule from a template may block every AI answer engine without realising it — which is why the rule separates per-bot warnings from the all-blocked error."
    }
  ],
  "faq-coverage": [
    {
      "source": "structuredData",
      "note": "FAQPage and HowTo JSON-LD are the exact schema types aeo/faq-coverage verifies are present — the rule fires an error when question-phrased H2 headings or a /faq URL path confirm FAQ intent yet neither markup type appears in the page's JSON-LD."
    },
    {
      "source": "schemaOrg",
      "note": "Schema.org defines the FAQPage and HowTo types that aeo/faq-coverage expects; the rule's detection logic keys on whether the page's JSON-LD contains either type after the heading-question or URL-path check confirms FAQ content."
    },
    {
      "source": "aiFeatures",
      "note": "Google narrowed FAQ rich results to government and health publishers in August 2023, shifting the remaining value of FAQPage markup squarely to AI extraction — the reason aeo/faq-coverage treats a missing schema as a missed AI Overviews eligibility signal rather than a cosmetic gap."
    }
  ],
  "summary-bait": [
    {
      "source": "helpfulContent",
      "note": "People-first guidance asks whether a page gives readers reason to return — aeo/summary-bait operationalises the inverse: when 70% of citable facts (dollar amounts, percentages, timeframes, form numbers) cluster in the first 150 words and nothing original follows, the page is shaped to be consumed without being read."
    },
    {
      "source": "aiFeatures",
      "note": "AI Overviews lift compact, fact-dense openers as verbatim attribution sources; aeo/summary-bait flags the 70%-in-150-words pattern precisely because it is optimised for that extraction path at the expense of depth that would serve an actual reader scrolling past the opener."
    }
  ],
  "translation-no-op": [
    {
      "source": "hreflang",
      "note": "Hreflang is intended to route searchers to a genuinely localised version of a page — content/translation-no-op exposes when that intent is absent: locale folders like /fr/ or /fr-ca/ that score 95% or higher SimHash similarity against their /en/ counterpart are duplicate English masquerading as translated content, making hreflang annotations misleading."
    },
    {
      "source": "scaledContent",
      "note": "Scaled-content-abuse policy covers any high-volume production method that yields pages with little added value; locale-folder duplication is a scaled pattern — the same body republished under N language prefixes at once — and the 95% SimHash ceiling is the rule's operationalisation of that low-value threshold."
    },
    {
      "source": "helpfulContent",
      "note": "People-first guidance requires that content serve the actual audience of the page; a /de/ URL whose body is byte-for-byte English fails that test, and content/translation-no-op's SimHash check surfaces those failures before Googlebot assigns them to the wrong regional audience."
    }
  ],
  "regurgitated-content": [
    {
      "source": "scaledContent",
      "note": "Scaled-content-abuse policy prohibits pages produced at volume with little original contribution; content/regurgitated-content operationalises that boundary by requiring at least 2 of 5 Places-API tells — including image CDN saturation above 60% and map embeds — before accusing a directory page of adding nothing beyond a third-party data feed."
    },
    {
      "source": "siteReputationAbuse",
      "note": "Site-reputation-abuse policy targets sections that borrow a host's authority to re-surface third-party data; a directory relying on location and fake-authority cliché families alongside Places API image and markup tells is a structural match for that policy, which is why content/regurgitated-content fires only when multiple independent signals converge."
    },
    {
      "source": "helpfulContent",
      "note": "People-first guidance asks whether a page offers meaningful value beyond what aggregator feeds already provide; unsigned star-rating clusters and attribution footprints are the concrete absence-of-original-contribution signals content/regurgitated-content weighs in its 2-of-5 threshold."
    }
  ],
  "common-phrase-reuse": [
    {
      "source": "helpfulContent",
      "note": "People-first guidance penalises copy that reads as if written to sound useful rather than to be useful; content/common-phrase-reuse quantifies that gap by tallying how many of the roughly 42 entries across the five cliché categories in the bundled phrase list appear on a single page, firing a low-confidence warning when the cross-category accumulation reaches 3 or more distinct matches."
    },
    {
      "source": "scaledContent",
      "note": "Scaled-content-abuse enforcement targets templated prose that varies only the entity token while recycling stock surrounding copy; a page accumulating 3 or more phrases from the bundled phrase list's five cliché categories presents a lexical saturation fingerprint — the density and category spread signal batch generation more reliably than any individual phrase alone."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials warns against content produced primarily to rank rather than to inform; the bundled phrase list's five cliché categories operationalise that distinction, because real informational copy rarely needs location-filler, generic-marketing, aggregator-phrasing, fake-authority, or call-to-action stock language stacked on the same page."
    },
    {
      "source": "aiFeatures",
      "note": "AI extraction pipelines deprioritise passages dominated by formulaic marketing language drawn from the bundled phrase list; when 3 or more category-distinct clichés from the five-family bundled set appear on one page, the passage's information density drops below the threshold AI Overviews uses to select attributable, original-sounding excerpts for inclusion."
    }
  ],
  "wikipedia-paraphrase": [
    {
      "source": "scaledContent",
      "note": "Scaled-content-abuse policy explicitly names republishing existing information as a production method that yields little added value; content/wikipedia-paraphrase operationalises that risk at a 40% trigram-overlap threshold against a bloom-filter-encoded reference corpus, the point at which lightly reworded encyclopedia prose becomes statistically distinguishable from original analysis."
    },
    {
      "source": "helpfulContent",
      "note": "People-first guidance asks whether a page delivers insights or synthesis that readers could not easily find elsewhere; a 40%-trigram match against the Wikipedia reference corpus — checked via a 65,536-bit bloom filter with 3 FNV-1a hashes — is the rule's operationalisation of that originality test."
    },
    {
      "source": "schemaOrg",
      "note": "Schema.org vocabulary — Article, DefinedTerm, AboutPage — signals topical authority that Wikipedia paraphrase directly undercuts; content/wikipedia-paraphrase surfaces the trigram-overlap gap so publishers can decide whether to add structured authorship and sourcing before deploying entity-definition pages at scale."
    }
  ],
  "value-add": [
    {
      "source": "helpfulContent",
      "note": "People-first guidance is the conceptual frame content/value-add makes computable: the rule converts seven separate originality signals — regurgitation absence, dateModified freshness, citable-fact density, E-E-A-T category count, locale-translation fidelity, bundled-cliché density, and trigram encyclopedia overlap — into a single 0-to-1 composite score."
    },
    {
      "source": "scaledContent",
      "note": "Scaled-content-abuse policy penalises volume production yielding little per-page differentiation; content/value-add makes the enforcement threshold explicit: each of seven contributing signals is weighted at one-seventh (≈14%), so a page failing four signals sits at roughly 0.43 — below the 50% error floor — even if the remaining three pass cleanly."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials lists originality and usefulness as foundational quality expectations; content/value-add translates those principles into a deterministic second-pass composite — reading prior rule findings rather than re-parsing HTML — and emits a critical finding below 0.30 to mark URLs where fewer than three of the seven dimensions of substantive contribution pass."
    },
    {
      "source": "aiFeatures",
      "note": "AI Overviews and similar extraction pipelines prefer content that clears multiple originality dimensions simultaneously; content/value-add's 0-to-1 composite score surfaces URLs that individually pass each contributing rule at warning level but collectively fall short of the 50% average originality floor that separates extractable depth from surface filler."
    }
  ]
};

export const SYMPTOM_SOURCES: Record<string, MarketingSourceRef[]> = {
  "expired-domain-abuse": [
    {
      "source": "spamPolicies",
      "note": "Google named expired domain abuse as one of three new spam policies in the March 5, 2024 spam update; the policy text defines the violation as buying an expired domain primarily to boost the ranking of low-value content by exploiting the domain's residual reputation — the exact intent this page's diagnostics test for."
    },
    {
      "source": "helpfulContent",
      "note": "The helpful-content framing asks whether a page earns its ranking on its own merit; expired-domain-abuse recovery hinges on making the new content independently valuable rather than dependent on inherited authority, which is why the final diagnostic tests whether the same content would rank on a fresh domain."
    },
    {
      "source": "redirects",
      "note": "Google's redirects guidance underpins the 301-continuity check — equity passed through a redirect whose source and target share no topical or link-graph continuity is discounted, so a cluster of unrelated expired-domain redirects into one host is both ineffective and a spam signal."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials establishes that ranking should reflect content quality and relevance; the expired-domain classifier operationalises this by scoring current content against the domain's archived topical fingerprint, flagging the categorical mismatch this page teaches operators to detect."
    }
  ],
  "how-to-audit-programmatic-seo": [
    {
      "source": "helpfulContent",
      "note": "Google's helpful-content system continuously triages template quality by evaluating searcher utility; programmatic site audits must focus on identifying templates where page-level details do not carry standalone value, as failure to clear this bar results in site-level classifier demotions."
    },
    {
      "source": "scaledContent",
      "note": "The March 5, 2024 update established that high-volume generation using entity-swap structures with minimal variation constitutes scaled content abuse; audits identify these patterns by mapping the SimHash distribution of generated paths before algorithmic filters trigger."
    },
    {
      "source": "canonicalization",
      "note": "Google's duplicate consolidation rules indicate that when pages share identical skeletons, the indexer ignores the rel=canonical tag and selects a single representative URL; audits verify tag alignment and uniqueness ratios to prevent cannibalization collapse."
    },
    {
      "source": "crawlBudget",
      "note": "Crawl allocation is heavily throttled for sections showing low information density; auditing sitemap files ensures that unindexed or low-quality templates do not back up the crawler scheduler and delay the indexing of critical pages."
    }
  ],
  "lost-rankings-after-google-update": [
    {
      "source": "helpfulContent",
      "note": "The Helpful Content System, baked permanently into core ranking infrastructure after August 25, 2022, produces the cliff-shaped position chart that drops across an entire template family in a single day — money pages survive the same rollout because they carry per-page substance signals the pSEO siblings lack, not because any exclusion list protects them."
    },
    {
      "source": "scaledContent",
      "note": "The March 5, 2024 scaled-content-abuse update — the policy change most correlated with distributed template-family collapses anchored to an announced rollout window — demoted an estimated 45% of low-effort pages by applying SpamBrain's 60-second triage queue at corpus scale; impressions follow position losses inside 48 hours, a sequencing that distinguishes algorithmic demotion from a CDN canonical regression."
    },
    {
      "source": "spamPolicies",
      "note": "Google's spam policy taxonomy distinguishes the May 7, 2024 site-reputation-abuse enforcement from the March 5 scaled-content hit: the former collapses a single subfolder surgically while the main domain holds, the latter drops distributed template families across the property — knowing which mechanism anchors the position chart date narrows the remediation path and the re-crawl wait from weeks to a precise 2-to-10-day rollout window."
    },
    {
      "source": "simhash",
      "note": "Charikar's 2002 SimHash fingerprinting, adopted by Google's web indexing team in 2007, clusters near-identical template URLs above an 85% cosine-similarity ceiling before SpamBrain scores the cluster as a unit — every URL above that threshold loses authority simultaneously on the rollout day, which is why the Search Console position chart falls off a cliff in a single 24-hour window rather than eroding page by page over weeks."
    }
  ],
  "pages-deindexed-bulk": [
    {
      "source": "blockIndexing",
      "note": "Google's noindex documentation distinguishes a deliberate exclusion directive from the crawler's own classifier verdict: a stair-step loss of 30% or more of indexed URLs landing in 'Crawled — currently not indexed' means Google fetched each URL individually and evicted it — a classifier decision — whereas a rise in 'Excluded by noindex' or 'Blocked by robots.txt' points to a configuration regression that can be reversed without a reconsideration request."
    },
    {
      "source": "crawlBudget",
      "note": "Crawl-budget allocation drives the 'Discovered — currently not indexed' bucket: Googlebot's scheduler deprioritises URL patterns it has historically found low-value, leaving newly submitted sitemap entries seen but never fetched — the indexed-count barely-moves diagnostic that persists even after repeated manual 'Request indexing' submissions, because each slot the scheduler skips compounds the queue behind it."
    },
    {
      "source": "scaledContent",
      "note": "The scaled-content-abuse policy is the enforcement clause behind mass deindexation where 80% of one URL template disappears in a single day: Google's documentation names deindexation — removal from the index rather than positional demotion — as the harder enforcement mode reserved for page sets that contribute no incremental value, which is why traffic loss sometimes lags the indexed-URL collapse by a full 48 hours as cached SERPs clear."
    },
    {
      "source": "httpErrors",
      "note": "Soft-404 classification is Google's internal mechanism behind 'Crawled — currently not indexed' verdicts on HTTP 200 responses: a programmatic page whose extracted body text matches the thin-or-templated pattern Googlebot's renderer recognises triggers the same deprioritisation as a genuine 404, causing a stair-step rise in that bucket that does not correlate one-for-one with traffic loss because cached SERP impressions continue briefly after eviction."
    }
  ],
  "site-reputation-abuse-penalty": [
    {
      "source": "siteReputationAbuse",
      "note": "Google's May 7, 2024 site-reputation-abuse policy targets the structural pattern where a trusted host lends domain authority to a subfolder — /coupons/, /casino/, /loans/, or a labelled partner-content section — operated by a third party without the host's editorial involvement; the enforcement is surgical: 70-100% subfolder traffic collapse while the rest of the domain remains indexed and ranking, distinguishing it from a sitewide penalty."
    },
    {
      "source": "spamPolicies",
      "note": "When a manual action accompanies the subfolder demotion, Search Console's Security and Manual Actions panel displays the description 'The site appears to use third-party content to boost search rankings' — a label whose reconsideration clock requires demonstrating that the parasite section has been removed or that host-level editorial controls now govern what publishes under that path segment, assessed by a human reviewer, not re-scored algorithmically."
    },
    {
      "source": "helpfulContent",
      "note": "The Helpful Content System evaluates whether each URL section would satisfy a visitor who arrived independently from a query about that topic, without relying on the host brand's authority; a /reviews/ or /partner-content/ subfolder whose pages carry no named editorial staff, no original analysis, and no topic continuity with the host's established subject matter registers as a reputation-borrowing section, not a standalone audience-serving one."
    },
    {
      "source": "canonicalization",
      "note": "During remediation of a site-reputation-abuse subfolder, pointing the evicted subfolder's URLs to a rel=canonical on the original content source — the partner's own domain — and deploying 301 redirects away from the host tells Google's indexer the host never claimed editorial ownership of those resources, which is the structural signal that supports a successful reconsideration request and prevents re-flagging after reinstatement."
    }
  ],
  "traffic-drop-no-update": [
    {
      "source": "helpfulContent",
      "note": "A 15-40% organic decline over a 14-day window with no announced update is often a delayed Helpful Content System re-score: the classifier runs continuously and can demote pages weeks after content is first crawled, meaning the traffic fall appears unmoored from any single event. When impressions drop before clicks — the Search Console pattern where the performance chart shows declining impressions 3 to 5 days ahead of click losses — it indicates a ranking-position shift, not a CTR-only change, which points to the classifier rather than an AI Overviews snippet displacement."
    },
    {
      "source": "canonicalization",
      "note": "A silent CDN canonical regression — where a deploy changes which URL variant Googlebot canonicalizes to — can drain indexed-URL authority within 7 days without triggering any manual action or algorithm announcement. The diagnostic marker is a mismatch between the user-declared canonical and the Google-selected canonical visible in URL Inspection: when Google has silently re-elected a different URL as the canonical, the originally ranking page loses its accumulated signals to the new elected URL, producing a position drop that looks algorithmic but is actually a technical regression."
    },
    {
      "source": "searchEssentials",
      "note": "Google's Search Essentials documentation sets out the baseline technical requirements — correct crawling access, no accidental noindex tags, clean canonical signals, and a valid sitemap — that must be verified before attributing a traffic decline to content quality or demand shifts. Ruling out technical causes in this order (robots.txt, meta noindex, canonical drift, sitemap freshness) before examining content is the structured diagnostic sequence that avoids misdiagnosed remediation work on a site with a configuration regression."
    },
    {
      "source": "aiFeatures",
      "note": "An AI Overviews rollout can cut query-level CTR by 20-40% on informational terms without moving average position at all — the SERP adds an AI-generated answer above the organic results, which absorbs the click the first organic result previously captured. This is the traffic-drop-no-update pattern where Search Console shows position holding flat or even improving while clicks erode, because the ranking did not change but the click opportunity above the fold shrunk."
    }
  ],
  "thin-content-warning-search-console": [
    {
      "source": "scaledContent",
      "note": "The March 5, 2024 scaled-content-abuse update operationalised the 300-word substantive-body-text floor pseolint applies: Google's SpamBrain triage evicts URLs from the index as 'Crawled — currently not indexed' when extracted visible word count — after stripping nav, footer, and chrome — falls below the classifier's per-template threshold; a growing 'Crawled — currently not indexed' bucket concentrated on one URL template after that date is the canonical enforcement signature, not an explicit notification in Search Console's messaging UI."
    },
    {
      "source": "helpfulContent",
      "note": "Pseolint's 0.4 unique-to-total word ratio threshold targets vocabulary dilution that the Helpful Content System weighs independently of raw word count: a page with 400 total words but only 100 words unique to that URL — the rest shared across navigation copy, repeated CTAs, and templated disclaimers — registers as 75% boilerplate, failing the per-URL substance test within 21 to 45 days of first crawl even though its raw count clears 300."
    },
    {
      "source": "httpErrors",
      "note": "Google's soft-404 classification is the internal mechanism that surfaces the thin-content verdict as 'URL is not on Google' in URL Inspection with no further label: a 200-status page whose extracted body text falls below the classifier's floor is treated as a near-empty response, deprioritised without a formal noindex tag, which is why most pSEO operators encounter thin-content enforcement as a deduction from the indexed-URL count rather than a named warning in any Search Console panel."
    },
    {
      "source": "searchEssentials",
      "note": "Google's Search Essentials requirement that each indexed URL deliver standalone value to a visitor who arrives directly from a query means a template producing near-identical pages varying only a city name or product noun cannot satisfy the per-URL bar regardless of page count; consolidating variants into fewer, richer destination pages is the remediation path that restores 'Indexed' status within 21 to 45 days after a fresh recrawl of the consolidated URLs."
    }
  ],
  "manual-action-pure-spam": [
    {
      "source": "spamPolicies",
      "note": "Google's spam policies define 'Pure Spam' as automatically generated gibberish, cloaking, or scraped content with no substantial transformation; a Search Console Manual Actions entry carrying this label — whether site-wide or partial-match scoped to named URL patterns — suppresses affected templates to null ranking positions rather than demoting them a few places, which is why branded navigational queries survive the same day while every programmatic template falls out of the top 100 entirely."
    },
    {
      "source": "scaledContent",
      "note": "The 'Thin content with little or no added value' manual-action label that co-appears alongside Pure Spam in Search Console's Manual Actions panel is the human-confirmed enforcement of the threshold SpamBrain applied algorithmically on March 5, 2024: a reviewer verified that the flagged URL pattern exists at volume without per-page substance distinguishing one URL from its siblings, locking the reconsideration clock until the template-level differentiation problem is structurally fixed."
    },
    {
      "source": "searchEssentials",
      "note": "Google's reconsideration request process requires documenting three items for a pure-spam manual action: which specific URL patterns were deleted, which were consolidated with 301 redirects to richer destination pages, and what per-page signals now differentiate the retained URLs; a request submitted before the underlying template pattern is structurally changed is rejected without explanation, adding a 30-to-60-day penalty to the recovery timeline before the next reviewer slot opens."
    },
    {
      "source": "helpfulContent",
      "note": "The Helpful Content System's site-level classifier continues running against a domain while the Manual Actions panel shows a 'Pure Spam' or 'Thin content' entry; this means remediating the manually actioned patterns without also lifting the site-level classifier score produces a reconsideration approval that still leaves non-actioned templates in a depressed position state, making the dual-track fix — classifier score plus reconsideration documentation — the only path to full visibility recovery."
    }
  ],
  "traffic-dropped-rankings-unchanged": [
    {
      "source": "aiFeatures",
      "note": "Google's AI Overviews insert a generated answer box above the organic list on informational, top-of-funnel queries — 'what is', 'how to', 'best' head terms — absorbing the click the first organic result previously captured while leaving Search Console average position unchanged; the CTR decline that follows is the diagnostic tell: the Performance report's click line falls while the position line stays flat or improves, a pattern no rank tracker reports as a ranking loss because the rankings did not move."
    },
    {
      "source": "helpfulContent",
      "note": "The Helpful Content System's 'content created for search engines, not people' test explains why a page that holds rank but loses CTR faces a compounding problem: Google's quality evaluators assess whether a page's answer is genuinely more useful than the AI Overview it now competes against, and a low unique-value score or boilerplate-heavy template registers as redundant with the generated summary, suppressing CTR further even as the position holds, creating the paradox the Performance report surface."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials' baseline requirement — that each indexed URL deliver standalone value — intersects with the flat-position/falling-CTR pattern when a SERP adds an AI Overview: the page still satisfies Google's indexing bar but no longer wins the above-the-fold click because the generated answer already covered the intent; the structural remedy is moving the page up-funnel toward transactional or comparison queries where AI Overviews appear less frequently and CTR remains organic-list-driven."
    }
  ],
  "new-pages-not-getting-indexed": [
    {
      "source": "crawlBudget",
      "note": "Google's crawl-budget guidance explains the 'Discovered — currently not indexed' pile-up directly: when a large batch of programmatic URLs is declared in a sitemap simultaneously, Googlebot's scheduler allocates crawl slots by perceived per-template quality; URL patterns that share a skeleton with previously evicted siblings sit at the back of the queue indefinitely, so the indexed-URL count barely moves despite repeated sitemap pings and manual 'Request indexing' submissions."
    },
    {
      "source": "sitemaps",
      "note": "The sitemap protocol treats a submitted file as a prioritisation hint rather than a crawl guarantee; submitting tens of thousands of programmatic URLs in one sitemap index without per-entry lastmod timestamps or frequency hints signals uniform priority, collapsing the scheduler's ability to distinguish newly monetisable pages from stale boilerplate siblings — a structural omission that keeps the 'Discovered — currently not indexed' bucket growing with no corresponding rise in the indexed count."
    },
    {
      "source": "blockIndexing",
      "note": "A robots meta noindex tag or X-Robots-Tag set during staging and never reverted before launch is the misconfiguration that fills both indexation buckets simultaneously: each URL appears in 'Discovered — currently not indexed' with no crawl investment, and a manual 'Request indexing' submission fetches the page only to immediately bounce it back once Google's renderer reads the directive — distinguishing a tag regression from a quality problem before any content work begins."
    },
    {
      "source": "httpErrors",
      "note": "Google's soft-404 documentation explains the 'Crawled — currently not indexed' verdict that newly published programmatic pages inherit from their template: when Googlebot fetches a fresh URL and finds a 200-status response whose extracted body matches the thin-or-templated skeleton of previously evicted siblings, it withholds the index slot without returning an error code — a verdict that compounds as each new batch shares the same low-substance structure as prior deindexed relatives."
    }
  ],
  "scaled-content-abuse-penalty": [
    {
      "source": "scaledContent",
      "note": "Google's scaled-content-abuse policy, renamed from 'automatically generated content' on March 5, 2024, explicitly covers every high-volume production method — human-written templates, AI-generated prose, and hybrids — when the primary motive is ranking manipulation rather than distinct user assistance; 'what you see' in Search Console depends on the enforcement mode: algorithmic demotion shows as a quiet template-family position collapse in the Performance chart, while the manual 'Thin content with little or no added value' label suppresses URLs to null positions and requires a formal reconsideration request."
    },
    {
      "source": "spamPolicies",
      "note": "The spam policies overview frames the enforcement gradient the March 5, 2024 update deployed: SpamBrain's 60-second triage queue scores the cluster as a unit, so when the confidence threshold clears, a template family of thousands of URLs loses positions on the same rollout day rather than sequentially — the cluster-level scoring that also makes per-URL remediation insufficient unless the structural pattern driving the similarity is dismantled across the entire template."
    },
    {
      "source": "helpfulContent",
      "note": "The helpful-content 'content created for search engines, not people' test is the substantive floor behind the scaled-content classifier: a page that answers its target keyword but adds nothing a SERP competitor or a direct AI Overview does not already provide fails this test regardless of whether a human, template, or AI wrote it, making per-page original-data injection or a genuine editorial angle the operative recovery mechanism — not switching the writing method."
    },
    {
      "source": "simhash",
      "note": "Charikar's 2002 SimHash scheme, underpinning pseolint's near-duplicate detection, explains why a scaled-content site can lose 60% of its index in a single update cycle: 64-bit fingerprints cluster URLs above an 0.85 cosine-similarity ceiling and the lowest-authority cluster member is demoted without per-URL review, which is the batch-demotion mechanism that distinguishes scaled-content enforcement from individual spam actions and explains the stair-step indexed-URL drop visible in Search Console's Page indexing report."
    }
  ],
  "doorway-pages-penalty": [
    {
      "source": "doorways",
      "note": "Google's doorway-pages policy, enforced since March 16, 2015 and tightened with SpamBrain's 2022 rebuild, defines the exact structural fingerprint that '{service} in {city}', 'cheap {service} {city}', and '{service} near {city}' directories create: multiple gateway URLs targeting slight keyword variants that each hand the visitor off to the same booking form, contact page, or generic offer, where the copy delta between sibling pages is limited to the swapped place name in the title and an introductory sentence — no distinct local phone number, physical address, practitioner biography, or service differentiation justifies the separate URL."
    },
    {
      "source": "spamPolicies",
      "note": "The spam policies reference details two enforcement pathways visible in Search Console for a doorway-page cluster: the algorithmic route drops the entire template family out of the top 100 simultaneously on the same rollout day — because SpamBrain scores the cluster as a unit rather than each gateway URL individually — while the manual-action pathway adds a 'Doorway pages' entry to the Security and Manual Actions panel, blocking reconsideration until the gateway pages are consolidated to a single differentiated hub page with 301 redirects from every collapsed variant."
    },
    {
      "source": "scaledContent",
      "note": "The scaled-content-abuse policy intersects with the doorway policy whenever a site produces gateway clusters at volume using entity-swap templates: a '{service} near {city}' directory of 10,000 URLs that swaps only the location token fails both policies simultaneously — the doorway rule fires because each URL funnels to the same booking form regardless of city, and the scaled-content rule fires because entity-swap production at that volume constitutes ranking manipulation; pseolint therefore requires three independent signals — SimHash above 0.85, entity-swap detection, and structural template confirmation — before escalating to error severity."
    },
    {
      "source": "simhash",
      "note": "SimHash's locality-sensitive fingerprinting operationalises Google's convergence test on doorway clusters: two gateway pages whose 64-bit fingerprints score at or above 0.85 cosine similarity after entity masking — with the swapped city name, service modifier, or ZIP code stripped out — are treated by SpamBrain as the same page wearing a different noun; the only ranking contribution is the keyword variant in the title, not differentiated content serving a distinct local user intent, which is the cluster-level verdict that triggers the simultaneous position collapse across the entire template family on a rollout day."
    },
    {
      "source": "canonicalization",
      "note": "Remediation of a doorway-page cluster requires both a rel=canonical redirect and a 301: collapsing every '{service} in {city}' gateway URL to a single authoritative hub page via a 301 transfers residual link equity to the surviving destination, while pointing each gateway's canonical tag to that hub signals to Google's indexing pipeline that the permutation URLs were never intended as independent indexable resources — the dual-signal approach that supports a successful Manual Actions reconsideration after the gateway-page pattern has been structurally dismantled."
    }
  ],
  "duplicate-google-chose-different-canonical": [
    {
      "source": "canonicalization",
      "note": "Google's consolidate-duplicate-URLs guidance explains the 'Duplicate, Google chose a different canonical than user' Search Console verdict precisely: when a page's rel=canonical points at itself but Google's indexing pipeline detects that a sibling URL shares roughly 90% of the same extracted content, the indexer overrides the declared tag and elects the sibling with stronger authority signals — link equity, earlier discovery date, or higher crawl frequency — leaving the audited URL with mismatched 'User-declared canonical' and 'Google-selected canonical' fields in URL Inspection and no index slot despite a technically valid tag."
    },
    {
      "source": "simhash",
      "note": "Charikar's SimHash fingerprinting is the mechanism behind the canonical override: programmatic pages whose 64-bit content fingerprints cluster above Google's near-duplicate similarity ceiling — the threshold the web indexing team has used since adopting the 2007 implementation — are collapsed into one canonical cluster, with the weakest-authority member overridden, which is why URL Inspection returns the mismatch even when every page in the template carries a self-referencing rel=canonical tag."
    },
    {
      "source": "helpfulContent",
      "note": "The helpful-content per-page-uniqueness test explains why the 'Duplicate, Google chose a different canonical' verdict is a structural quality warning rather than a trivial label: Google's indexer elected a sibling over the audited URL because the audited page lacks distinct vocabulary, citable data, or original editorial content sufficient to justify a separate index slot — the same uniqueness gap that, at template scale, tips the bucket from canonical override into 'Crawled — currently not indexed' during a core update rollout."
    },
    {
      "source": "crawlBudget",
      "note": "Every URL earning the 'Duplicate, Google chose a different canonical than user' verdict still consumed a crawl-budget slot — Googlebot fetched, rendered, and fingerprinted it before deferring the index decision — so a template family of several hundred overridden pages drains allocation that would otherwise fund fresh or recently updated URLs; the compound effect is an indexation lag on genuinely new pages that grows in proportion to the size of the duplicated template cluster."
    }
  ]
};

export const TOOL_SOURCES: Record<string, MarketingSourceRef[]> = {
  "spambrain-checker": [
    {
      "source": "spamPolicies",
      "note": `Google's spam policies enumerate the named violation categories SpamBrain enforces; the checker maps all ${SCORED_RULE_COUNT} inferred structural signals across its rule set to those categories, so every domain-level risk score entry traces to a documented enforcement clause rather than an opaque internal classifier weight.`
    },
    {
      "source": "scaledContent",
      "note": "The March 5, 2024 scaled-content-abuse enforcement is the calibration baseline for the checker's site-type-aware scoring: publication-burst stacking, uniform HTML skeleton fingerprints, and corpus-wide boilerplate saturation are three programmatic footprints the update targeted, surfaced across up to 200 pages in a 60-second crawl."
    },
    {
      "source": "helpfulContent",
      "note": "People-first guidance asks whether a domain was built for readers or rank manipulation; the checker's domain-level risk score aggregates per-page spam/* findings into a 0-to-100 composite, penalising hosts where the substantive-to-filler URL ratio falls below the floor the Helpful Content System established in August 2022."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials draws the enforceable boundary between acceptable programmatic production and algorithmic demotion; the checker's structured JSON output lets operators triage which URLs cross that line before a recrawl delivers a verdict — no Search Console account or announced rollout required."
    }
  ],
  "thin-content-scanner": [
    {
      "source": "scaledContent",
      "note": "Scaled-content-abuse enforcement — active March 5, 2024 — targets per-URL vocabulary starvation; the scanner counts whitespace-split tokens after stripping nav and footer chrome, flagging URLs below a 300-word floor configurable per archetype: a FAQ stub and a service directory listing carry different appropriate minimums."
    },
    {
      "source": "helpfulContent",
      "note": "People-first guidance operationalises as a satisfaction threshold the scanner approximates with a lexical-uniqueness ratio: pages where fewer than 40 percent of vocabulary tokens are exclusive to that URL — not shared with sibling pages in the same cluster — are flagged as probable soft-404 candidates."
    },
    {
      "source": "httpErrors",
      "note": "Soft-404 assignment is how Google responds to substance-deficient 200-OK responses; the scanner's dual-gate check — 300-word minimum plus a 60-percent boilerplate ceiling on recycled phrasing — identifies URLs most at risk of landing in 'Crawled — currently not indexed' before a recrawl confirms that verdict."
    },
    {
      "source": "searchEssentials",
      "note": "Search Essentials requires each URL offer something beyond what already exists; the scanner delivers per-page word counts, per-archetype substance grades, and recycled-phrasing ratios across 200 free-tier or 500 Pro pages — a concrete pre-submission checklist rather than an abstract quality rubric to interpret retroactively."
    }
  ],
  "doorway-page-detector": [
    {
      "source": "doorways",
      "note": "Google's doorway policy — published March 16, 2015 — defines the cluster geometry the detector targets: city-by-city or modifier-by-modifier permutation sets where every variant routes visitors to one identical booking form; the detector groups URLs by shared path-segment prefix before evaluating destination convergence."
    },
    {
      "source": "scaledContent",
      "note": "Scaled-content-abuse enforcement extended doorway detection to machine-generated permutation sets; the detector's entity-masking step — stripping city names, ZIP codes, service modifiers, and product nouns before hashing — isolates the structural template from the swapped variable, exposing clusters differentiated only by a single substituted noun."
    },
    {
      "source": "simhash",
      "note": "Charikar's 2002 locality-sensitive hashing — adopted by Google's indexing team in 2007 — provides the 64-bit fingerprint at the detector's similarity gate; pairs at or above 0.85 cosine similarity after entity masking must co-fire with a structural template check before the rule emits at weight-25."
    },
    {
      "source": "spamPolicies",
      "note": "Spam policies frame doorways as gateway constructs intercepting query traffic rather than serving distinct informational needs; the detector distinguishes legitimate multi-branch businesses — location pages with differing staff, hours, neighbourhood context — from funnel clusters where removing the swapped modifier leaves 95-percent SimHash overlap."
    }
  ]
};
