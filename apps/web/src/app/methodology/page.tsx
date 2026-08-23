import { type Metadata } from "next";
import Link from "next/link";
import { SCORED_RULE_COUNT } from "@pseolint/core/rules/scope";
import { FOLKLORE } from "@/lib/folklore";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";
import { ENGINE_VERSION } from "@/lib/version";

const LAST_CALIBRATED = "2026-05-03";
const NEXT_REFRESH_TARGET = "2026-08-03"; // quarterly cadence
const PAGE_PATH = "/methodology";
const PAGE_TITLE = "Calibration methodology";
const PAGE_DESCRIPTION =
  "How pseolint calibrates verdicts against in-production pSEO sites that win in search. Open-source corpus, runner, regression tests.";

function absoluteUrl(path: string): string {
  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Escape `<` so a JSON-LD string can't terminate the surrounding <script> early. */
function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * FAQ pairs mirrored from the visible Q&A on this page: these paraphrase the
 * sections below and are kept in sync by hand (not entity-swapped boilerplate).
 *
 * The FAQPage node below no longer earns a rich result. Google removed the FAQ
 * rich result from Search on May 7, 2026 and deleted its documentation on
 * June 15, 2026, and `aeo/faq-coverage` stopped recommending the markup in the
 * same change. This page keeps it pending a site-wide sweep; see
 * docs/folklore.md and /folklore.
 * https://developers.google.com/search/updates#removing-faq-rich-result
 */
const METHODOLOGY_FAQ: { q: string; a: string }[] = [
  {
    q: "How does pseolint calibrate its verdicts?",
    a: "pseolint adds predictive validity on top of face validity: it audits a curated corpus of in-production programmatic-SEO sites that demonstrably win in search, and treats any deviation between its verdict and a site's real-world ranking success as a bug in the engine, not the site. The corpus, runner, and regression tests are open-source and reproducible at a fixed sample seed.",
  },
  {
    q: "How do audits work?",
    a: "The engine shifts the unit of analysis from URL to template. Phase 1 clusters sitemap URLs into templates (≥1% coverage, ≥5 URLs, ≥2 surviving templates). Phase 2 stratified-samples pages across templates (up to 200 (free / monitoring) or 500 (manual re-audit)) and runs every rule per template. The site verdict is the worst template verdict among templates covering ≥5% of URLs, so a tiny page can't tank the site and a dominant broken template can't hide behind a clean one.",
  },
  {
    q: "Does pseolint measure domain authority?",
    a: "No. pseolint is a static-content and link-graph analyzer; it reads what pages say, how they link, and how they nest. It does not check backlinks, brand mentions, domain age, or any external trust signal, and has no Moz/Ahrefs/Semrush dependency, by design, so it can run offline against a build directory. Pass --authority-score (0-100) to shift the verdict ladder for your authority tier.",
  },
  {
    q: "What does a passing verdict mean?",
    a: "A pass means pseolint's rules don't false-positive on shapes that high-authority sites successfully ship. A fail often means the engine correctly identified a real issue (duplicate titles, redirect chains, missing OG tags) that the site can absorb because of its authority, not that the engine is wrong.",
  },
  {
    q: "What stays true regardless of which sites pseolint audits?",
    a: "Doorway-pattern findings collapse to one cluster line instead of per-pair noise; sample-seed determinism makes verdicts reproducible (mulberry32 PRNG); info-severity findings are capped per bucket so they can't tank a verdict on their own; severity demotions are auditable via summary.appliedSeverityDemotions; and the spec, corpus, runner, and regression tests are open-source so anyone can re-run the calibration.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: METHODOLOGY_FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export function generateMetadata(): Metadata {
  const url = absoluteUrl(PAGE_PATH);
  return {
    title: `${PAGE_TITLE} · pseolint`,
    description: PAGE_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      siteName: "pseolint",
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      images: [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: PAGE_TITLE }],
    },
    twitter: {
      card: "summary_large_image",
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      images: [absoluteUrl("/opengraph-image")],
    },
  };
}

interface CorpusSite {
  url: string;
  vertical: string;
  expectedCeiling: string;
  actualVerdict: string;
  risk: number;
  note?: string;
}

const REPUTABLE_SITES: CorpusSite[] = [
  // 2026-05-03 round 11 (after v0.5.2 added 4 content-quality rules
  //: title-uniqueness, heading-structure, image-alt-text, og-completeness).
  // The new rules surfaced real findings that previous rounds missed.
  // We did NOT update ceilings to make the corpus pass; that would be
  // calibration laundering. The fails below reflect actual, documented
  // issues each site has; they remain "fails" in this snapshot because
  // those issues, while tolerated by Google for these high-authority
  // domains, would matter for lower-authority operators copying the
  // same shapes.
  { url: "zapier.com/apps/slack/integrations", vertical: "integration directory", expectedCeiling: "caution", actualVerdict: "concerning", risk: 55, note: "Real finding: tech/canonical-consistency × 8 (mixed error+info) on integration pages with tracking parameters." },
  { url: "g2.com/categories", vertical: "software directory", expectedCeiling: "caution", actualVerdict: "ready", risk: 18 },
  { url: "wise.com/us/currency-converter", vertical: "currency pair", expectedCeiling: "caution", actualVerdict: "caution", risk: 26 },
  { url: "webflow.com/templates", vertical: "template gallery", expectedCeiling: "caution", actualVerdict: "caution", risk: 38 },
  { url: "typeform.com/templates", vertical: "template gallery", expectedCeiling: "caution", actualVerdict: "critical", risk: 61, note: "Real finding: content/title-uniqueness × 6, multiple template gallery cards share the exact same title. Google ranks Typeform despite this because of authority; lower-DA operators with the same pattern would be demoted." },
  { url: "segment.com/integrations", vertical: "integration directory", expectedCeiling: "caution", actualVerdict: "critical", risk: 61, note: "Real findings: spam/boilerplate-ratio × 25 (warning) + tech/redirect-chain × 25 (warning). Cumulative impact on integrity bucket pushes critical." },
  { url: "jasper.ai/templates", vertical: "template gallery", expectedCeiling: "caution", actualVerdict: "caution", risk: 37 },
  { url: "ramp.com/spend-management", vertical: "category directory", expectedCeiling: "caution", actualVerdict: "ready", risk: 19 },
];

const SKIPPED_SITES: { url: string; reason: string }[] = [
  { url: "nerdwallet.com/best/credit-cards", reason: "blocks our user-agent (403/CAPTCHA)" },
  { url: "numbeo.com/cost-of-living", reason: "p95 ≈ 30s under audit load, safe-mode origin gate aborts" },
  { url: "airbyte.com/connectors", reason: "p95 > 4× baseline under audit load, safe-mode origin gate aborts" },
  { url: "stripe.com/atlas/states", reason: "URL returns 404 in our crawl" },
];

function VerdictPill({ v }: { v: string }) {
  const colorClass =
    v === "ready" ? "bg-success/15 text-success"
      : v === "caution" ? "bg-warning/15 text-warning"
      : v === "concerning" ? "bg-destructive/15 text-destructive"
      : "bg-muted/30 text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] ${colorClass}`}>
      {v}
    </span>
  );
}

export default function MethodologyPage(): React.ReactElement {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(FAQ_JSON_LD) }}
      />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Methodology · v{ENGINE_VERSION} · for skeptical engineers
      </div>

      <h1
        className="mt-3 max-w-3xl text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        How pseolint&apos;s verdicts are calibrated.
      </h1>

      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Most SEO audit tools rely on face validity: &quot;these rules look like
        they map to documented Google policy.&quot; pseolint adds <em>predictive</em>{" "}
        validity: we audit a curated corpus of in-production pSEO sites that
        demonstrably win in search, and treat any deviation between our verdict
        and the site&apos;s real-world ranking success as a bug in our engine,
        not in the site.
      </p>

      {/* audit pipeline overview: positioned near the top so engineers
          understand the sampling model before reading the calibration data */}
      <section className="mt-10 rounded-[22px] border border-border/60 bg-card/40 p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          // pipeline
        </p>
        <h2 className="mt-2 text-base font-semibold tracking-tight text-foreground sm:text-lg">
          How audits work: two-phase template pipeline
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          pseolint pivots the unit of analysis from URL to template. A 100k-URL directory
          no longer averages findings across a flat 200-URL sample: instead, each
          template cluster is audited independently and produces its own verdict.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-primary/80">
              Phase 1: Template detection
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Cluster sitemap URLs by signature (e.g.{" "}
              <code className="font-mono text-[10px]">/listing/:slug</code>). Filter
              to clusters with <strong className="text-foreground">≥1% coverage</strong>{" "}
              of total discovered URLs and <strong className="text-foreground">≥5 URLs</strong>.
              Require <strong className="text-foreground">≥2 surviving templates</strong>{" "}
              to activate the template path: single-template sites fall through to the
              legacy per-URL view (spec §15.3). Cost: ~T HTTP fetches (T = template count,
              typically 5–20). Cheap.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-primary/80">
              Phase 2: Per-template deep audit
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Stratified-sample pages{" "}
              <strong className="text-foreground">across templates</strong>: up to 200
              (free / scheduled monitoring) or 500 (manual re-audit). Run all {SCORED_RULE_COUNT} rules on each sample set. Compute
              per-template risk, verdict, and variance metric. The page budget is spread across
              templates so a dominant cluster can&apos;t crowd out coverage of the smaller ones.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-primary/80">
              Aggregation: site verdict
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Site verdict = worst template verdict,{" "}
              <strong className="text-foreground">filtered to templates with ≥5% URL
              coverage</strong> (spec §15.1). A tiny <code className="font-mono text-[10px]">/about</code>{" "}
              page at critical doesn&apos;t tank the site. A{" "}
              <code className="font-mono text-[10px]">/listing/*</code> template covering
              97% of the site does. Templates below 5% still appear in the dashboard
              drill-down; they just don&apos;t drive the headline.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-primary/80">
              Variance metric: uniformity score
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              For each template:{" "}
              <code className="font-mono text-[10px]">uniformity = 1 - mean(stdev(per-rule fire-rates))</code>.
              High uniformity (≥0.7) = every sample has the same problems: template is broken
              uniformly, one structural fix helps all N pages. Low uniformity = problem is
              data-quality-dependent, not template-structural. Surfaces in the template card
              as a colour-coded bar (green / yellow / red at 0.7 / 0.4 thresholds).
            </p>
          </div>
        </div>

        {/* ASCII pipeline diagram */}
        <pre className="mt-5 overflow-x-auto rounded-[12px] border border-border/60 bg-muted/10 p-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
{`sitemap URLs (100k)
        │
        ▼ Phase 1: Template detection (~T fetches)
  clusterUrlTemplates()
        │  filter: ratio ≥ 1%, count ≥ 5, ≥ 2 survivors
        ▼
  Template[] { signature, totalUrls }
        │
        ▼ Phase 2: Per-template deep audit (stratified sample)
  for each template:
    sample (stratified)  →  fetch + parse  →  run ${SCORED_RULE_COUNT} rules
    compute: risk, verdict, uniformityScore, topDriver
        │
        ▼ Aggregation
  siteVerdict = worst(templates where coverage ≥ 5%)
  AuditResult { templates[], findings[], verdict, risk }`}
        </pre>
      </section>

      <div className="mt-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          // documentation note
        </p>
        <h3 className="mt-2 text-base font-semibold tracking-tight text-foreground sm:text-lg">
          Read this as engineering reference. Not a testimonial page.
        </h3>

        <dl className="mt-5 divide-y divide-border/40 border-y border-border/40">
          <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
            <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              These sites
            </dt>
            <dd className="text-sm leading-relaxed text-foreground">
              Public pSEO sites we audited without permission.{" "}
              <span className="text-muted-foreground">
                Not pseolint customers. Have not endorsed pseolint, and we
                don&apos;t imply they have. Picked because they demonstrably
                win in search: useful as a ground-truth calibration target.
              </span>
            </dd>
          </div>

          <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
            <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              These numbers
            </dt>
            <dd className="text-sm leading-relaxed text-foreground">
              Point-in-time engine-validation data for skeptical engineers.{" "}
              <span className="text-muted-foreground">
                Not customer-success metrics. When pseolint has actual
                customer recovery stories, they will live elsewhere with
                explicit consent and attribution.
              </span>
            </dd>
          </div>

          <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
            <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              A pass means
            </dt>
            <dd className="text-sm leading-relaxed text-foreground">
              Our rules don&apos;t false-positive on shapes that high-authority
              sites successfully ship.{" "}
              <span className="text-muted-foreground">
                A fail often means the engine correctly identified a real
                issue (duplicate titles, redirect chains, missing OG tags)
                that the site can absorb because of authority: not that the
                engine is wrong. See &quot;How to read our verdict&quot;
                below.
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <dl className="mt-8 grid gap-y-3 border-y border-border/40 py-5 text-sm sm:grid-cols-[180px_1fr] sm:gap-x-6 sm:gap-y-4">
        <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">License</dt>
        <dd className="font-mono text-xs text-foreground">
          MIT.{" "}
          <a href="https://github.com/ouranos-labs/pseolint" className="text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
            github.com/ouranos-labs/pseolint
          </a>
        </dd>

        <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Reproducibility</dt>
        <dd className="font-mono text-xs text-foreground">
          <code>--sample-seed 1729</code>{" "}
          <span className="text-muted-foreground">: same seed, same audit, same verdict</span>
        </dd>

        <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Verifiability</dt>
        <dd className="font-mono text-xs text-foreground">
          <code>bun run scripts/calibration-reputable-pseo.ts</code>{" "}
          <span className="text-muted-foreground">: reruns against the same corpus</span>
        </dd>

        <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Limitations</dt>
        <dd className="font-mono text-xs text-foreground">
          Documented inline.{" "}
          <span className="text-muted-foreground">Trade-offs and blind spots, with roadmap fixes, in the sections below.</span>
        </dd>
      </dl>

      <div className="mt-6 rounded-[18px] border border-border/60 bg-card/40 p-5 text-sm leading-relaxed">
        <p className="text-foreground">
          <strong>Last calibrated:</strong>{" "}
          <time dateTime={LAST_CALIBRATED} className="font-mono">
            {new Date(LAST_CALIBRATED + "T00:00:00Z").toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            })}
          </time>
          {" "}· Engine: <code className="font-mono text-xs">v{ENGINE_VERSION}</code>
          {" "}· Ruleset version <code className="font-mono text-xs">12</code>
          {" "}· Sample seed <code className="font-mono text-xs">1729</code>
        </p>
        <p className="mt-2 text-muted-foreground">
          <strong>Next refresh target:</strong>{" "}
          <time dateTime={NEXT_REFRESH_TARGET} className="font-mono">
            {new Date(NEXT_REFRESH_TARGET + "T00:00:00Z").toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            })}
          </time>
          {" "}: quarterly cadence. Numerical results below are point-in-time;
          they will drift as sites redesign or as our engine evolves.
          Methodology and trade-offs (the durable claims) stay stable across
          refreshes.
        </p>
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          The reputable-pSEO corpus
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Twelve programmatic-SEO sites curated to span verticals (integration
          directories, currency-pair converters, template galleries, category
          directories, city-level cost-of-living indices) and ranking strength.
          Every entry has a documented &quot;ground-truth ceiling&quot;: the
          verdict pseolint must produce *or better* for the engine to be
          considered correctly calibrated. The corpus, the runner, and the
          regression tests are open-source.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <a
            href="https://github.com/ouranos-labs/pseolint/blob/main/packages/core/calibration/reputable-pseo-corpus.json"
            className="inline-flex items-center rounded-md border border-border-strong px-2 py-1 font-mono text-foreground hover:bg-secondary"
          >
            corpus json →
          </a>
          <a
            href="https://github.com/ouranos-labs/pseolint/blob/main/scripts/calibration-reputable-pseo.ts"
            className="inline-flex items-center rounded-md border border-border-strong px-2 py-1 font-mono text-foreground hover:bg-secondary"
          >
            runner →
          </a>
          <a
            href="https://github.com/ouranos-labs/pseolint/blob/main/docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md"
            className="inline-flex items-center rounded-md border border-border-strong px-2 py-1 font-mono text-foreground hover:bg-secondary"
          >
            full spec (9-round iteration story) →
          </a>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Snapshot results
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Captured <time dateTime={LAST_CALIBRATED}>{LAST_CALIBRATED}</time>.
          Subject to drift; re-run any time.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {REPUTABLE_SITES.map((s) => {
            const meets = s.expectedCeiling === s.actualVerdict
              || (s.expectedCeiling === "caution" && s.actualVerdict === "ready");
            return (
              <div
                key={s.url}
                className={`rounded-[14px] border p-3 ${meets ? "border-success/25 bg-success/5" : "border-destructive/25 bg-destructive/5"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11px] text-foreground" title={s.url}>{s.url}</p>
                    <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{s.vertical}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] ${meets ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}
                    title={`expected ≤ ${s.expectedCeiling}, actual ${s.actualVerdict}, risk ${s.risk}`}
                  >
                    {s.actualVerdict}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>≤ <VerdictPill v={s.expectedCeiling} /></span>
                  <span className="font-mono">risk {s.risk}</span>
                </div>
                {s.note ? (
                  <p className="mt-2 border-t border-border/30 pt-2 text-[10px] leading-relaxed text-muted-foreground">
                    {s.note}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Three more corpus sites (nerdwallet, numbeo, stripe.com/atlas) are
          excluded from the snapshot because they consistently fail to fetch
          under our crawler: see &quot;Excluded&quot; below.
        </p>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Three sites score worse than
          their ceiling</strong> on the snapshot date. In every case, the
          drivers are <em>real findings</em>, not engine noise:
        </p>
        <ul className="mt-2 grid gap-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">Zapier (concerning)</strong>{" "}
            — <code className="font-mono text-xs">tech/canonical-consistency</code>{" "}
            fires on integration pages with tracking parameters that don&apos;t
            canonicalise back to the parameter-free URL. Real tech-debt.
          </li>
          <li>
            <strong className="text-foreground">Typeform (critical)</strong>{" "}
            — <code className="font-mono text-xs">content/title-uniqueness</code>{" "}
            fires on 6 template-gallery cards that share the exact same
            title (templates with different content but identical heading
            text). The new title-uniqueness rule (v0.5.2) caught this. A
            site without Typeform&apos;s authority would lose rankings on
            those duplicate-titled pages.
          </li>
          <li>
            <strong className="text-foreground">Segment (critical)</strong>{" "}
            — <code className="font-mono text-xs">spam/boilerplate-ratio</code>{" "}
            and <code className="font-mono text-xs">tech/redirect-chain</code>{" "}
            both fire on 25 of 41 sampled pages. Catalog-shape findings,
            but real ones.
          </li>
        </ul>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          We did NOT update the ceiling on these sites to force a pass.
          That would be calibration laundering. The fail status reflects
          the engine&apos;s honest reading; what these sites get away with
          is tied to authority, not content quality. Pass{" "}
          <code className="font-mono text-xs">--authority-score 80</code>{" "}
          when auditing these sites and the verdict shifts one tier
          lenient (concerning → caution; critical → concerning); that&apos;s
          the bring-your-own-DA mechanism documented under <em>Limitations</em>{" "}
          above.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Trade-offs we accepted
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Calibration is two-axis. We measured both.
        </p>

        <div className="mt-5 grid gap-x-8 gap-y-4 border-y border-border/40 py-5 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
              + reputable-pSEO axis
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              False-positive rate on reputable pSEO went from{" "}
              <span className="font-mono">33% → 78%</span> over 9 calibration
              rounds. Cluster collapse killed the 276-line doorway noise.
              Sample-seed made verdicts reproducible. Info findings can&apos;t
              tank a verdict on their own.
            </p>
          </div>

          <div className="sm:border-l sm:border-border/40 sm:pl-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
              − borderline-quality axis
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              On the secondary{" "}
              <a href="https://github.com/ouranos-labs/pseolint/blob/main/scripts/dogfood-v043.ts" className="underline decoration-dotted underline-offset-2">
                weak-pSEO dogfood corpus
              </a>, two sites previously predicted{" "}
              <VerdictPill v="caution" /> now score <VerdictPill v="ready" />:{" "}
              <code className="font-mono text-xs">wordpress.com</code>{" "}
              (defensible: polished marketing site) and{" "}
              <code className="font-mono text-xs">expatistan.com</code>{" "}
              (3-page sample artifact). One regression the other direction:{" "}
              <code className="font-mono text-xs">nextjs.org</code>{" "}
              <VerdictPill v="ready" /> → <VerdictPill v="caution" /> on real
              cross-domain canonical findings.
            </p>
          </div>
        </div>

        <blockquote className="mt-5 max-w-2xl border-l-2 border-primary/40 pl-4 text-sm italic leading-relaxed text-muted-foreground">
          The primary failure mode of v0.5.1 was false-positives on real
          working pSEO sites: which destroyed credibility with the audience
          that actually uses the tool. The new false negatives are at the
          verdict-ladder boundary; neither says &quot;you&apos;re great&quot; while
          genuinely being a spam farm.
        </blockquote>
        <p className="mt-3 text-xs text-muted-foreground">
          Full discussion in the{" "}
          <a
            href="https://github.com/ouranos-labs/pseolint/blob/main/CHANGELOG.md"
            className="underline decoration-dotted underline-offset-2"
          >
            v0.5.2 CHANGELOG&apos;s <em>Trade-offs (read this)</em> section
          </a>.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Limitations: domain authority is a blind spot
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">pseolint does not measure
          domain authority.</strong> The engine is a static-content + link-
          graph analyzer. It reads what your pages say, how they link, and
          how they nest. It does not check backlinks, brand mentions, age,
          or any external trust signal that Google&apos;s quality systems
          weight heavily. There is no DA/DR/Moz/Ahrefs integration: by
          design, because pseolint is meant to be runnable offline against
          a build directory or a local dev server with no third-party API
          dependency.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          This matters for how to read the verdict. The reputable-pSEO
          calibration corpus is{" "}
          <strong className="text-foreground">biased toward high-authority
          domains</strong>: Zapier, G2, Wise, NerdWallet, Webflow are all
          well-established brands with strong backlink profiles. Their
          200-word integration pages or template-gallery cards rank because{" "}
          <em>they are those brands</em>. The same content shape on a
          6-month-old startup would be treated very differently by Google.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          So:
        </p>
        <ul className="mt-2 grid gap-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">If you operate at a
            comparable authority tier</strong> to the corpus (established
            brand, strong backlink profile, named editorial leadership),
            treat the verdict literally: a <code className="font-mono text-xs">caution</code>
            {" "}or worse is genuinely worth investigating.
          </li>
          <li>
            <strong className="text-foreground">If you are a newer or
            lower-authority operator,</strong> treat the verdict as a{" "}
            <em>directional minimum</em>, not a literal ceiling. Even a{" "}
            <code className="font-mono text-xs">ready</code> verdict on a
            structurally-fine page may not rank if your domain hasn&apos;t
            earned the authority to overcome thin or templated content.
            Conversely, fixing the issues pseolint flags is a necessary but
            not sufficient condition for ranking.
          </li>
        </ul>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          We intentionally do not fold third-party authority APIs into the
          engine because (a) it would make the tool dependent on paid SaaS,
          (b) the metrics differ across providers (Moz DA vs Ahrefs DR vs
          Semrush AS), and (c) Google uses signals none of those approximate
          well. Instead, <em>bring-your-own-authority</em> ships today: pass a
          normalized 0-100 authority score (the <code>--authority-score</code>{" "}
          flag, the MCP parameter, or a per-domain Pro setting) and the verdict
          ladder adjusts for your tier: the raw risk number is unchanged.
          Still future work: proxy-signal detection (domain age, internal-graph
          density, named editorial leadership) for callers without an authority
          figure of their own.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Tier-1 blind spots
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          What we don&apos;t detect, and where it&apos;s on the roadmap.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            { name: "Domain authority", status: "shipped", version: "v0.5.2", note: "--authority-score lets callers shift verdict for high/low-DA tiers." },
            { name: "Core Web Vitals (LCP/INP/CLS)", status: "roadmap", version: "planned", note: "Needs render-time PerformanceObserver harness." },
            { name: "Open Graph metadata", status: "shipped", version: "v0.5.2", note: "tech/og-completeness ships with the credibility layer." },
            { name: "Title tag uniqueness", status: "shipped", version: "v0.5.2", note: "content/title-uniqueness, raw, not entity-masked." },
            { name: "H1 structure", status: "shipped", version: "v0.5.2", note: "content/heading-structure, presence, single-H1, hierarchy." },
            { name: "Image alt-text", status: "shipped", version: "v0.5.2", note: "content/image-alt-text, skips decorative images." },
          ].map((g) => {
            const isShipped = g.status === "shipped";
            return (
              <div
                key={g.name}
                className={`rounded-[14px] border p-3 ${isShipped ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{g.name}</p>
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${isShipped ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                    {g.status} {g.version}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{g.note}</p>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Tier-2 (workaround exists): Search Console integration, crawl-budget
          waste, schema-content drift, outbound-link health, search-intent
          alignment. Tier-3 narrow gaps and the full taxonomy in the{" "}
          <a
            href="https://github.com/ouranos-labs/pseolint/blob/main/docs/superpowers/specs/2026-05-03-pseolint-blind-spots.md"
            className="underline decoration-dotted underline-offset-2"
          >
            blind-spots spec
          </a>.
        </p>

        {/* The mirror image of a blind spot: things we COULD flag and refuse
            to, because the primary source contradicts them. Same credibility
            argument, opposite direction, so it belongs next to this section. */}
        <p className="mt-3 text-xs text-muted-foreground">
          The inverse list matters too. {FOLKLORE.length} checks that competing tools ship, and
          that the primary sources contradict, are ones we deliberately do not run: title and
          meta-description character limits, meta keywords, sitemap priority and changefreq,
          word-count minimums, FAQPage markup for a rich result Google has retired. Each is
          documented with its primary source on{" "}
          <Link href="/folklore" className="underline decoration-dotted underline-offset-2">
            the folklore page
          </Link>
          .
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          What stays true regardless of which sites we audit
        </h2>
        <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-muted-foreground">
          <li><strong className="text-foreground">Cluster collapse on doorway-pattern findings.</strong> A 276-pair audit shows 1 cluster line, not 276.</li>
          <li><strong className="text-foreground">Sample-seed determinism.</strong> <code className="font-mono text-xs">AuditOptions.sampleSeed</code> makes verdicts reproducible across runs (mulberry32 PRNG).</li>
          <li><strong className="text-foreground">Per-bucket info-severity cap.</strong> A flood of info findings can no longer fill the 100-cap bucket and tank the verdict on its own (cap separately at 50).</li>
          <li><strong className="text-foreground">Auditable severity demotions.</strong> <code className="font-mono text-xs">summary.appliedSeverityDemotions</code> lists every rule whose severity was remapped on this audit. Pass <code className="font-mono text-xs">--strict</code> to disable demotion entirely.</li>
          <li><strong className="text-foreground">Sampling-aware rules.</strong> <code className="font-mono text-xs">links/unreachable-from-root</code> skips on partial samples (it can&apos;t tell isolation from sample shape).</li>
          <li><strong className="text-foreground">Open-source spec, corpus, runner, regression test.</strong> Anyone can re-run our calibration and verify these claims.</li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Excluded sites (and why)
        </h2>
        <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-muted-foreground">
          {SKIPPED_SITES.map((s) => (
            <li key={s.url}>
              <code className="font-mono text-xs text-foreground">{s.url}</code>
              <span className="ml-2">: {s.reason}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Future work
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          <strong className="text-success">Shipped in v0.5.2:</strong>{" "}
          <code className="font-mono text-xs">AuditOptions.authorityScore</code>{" "}
          (CLI: <code className="font-mono text-xs">--authority-score 0-100</code>)
          — bring-your-own-DA verdict ladder shift. Pass-through to formatter
          callers via <code className="font-mono text-xs">summary.appliedSeverityDemotions</code>.
          What remains:
        </p>
        <ol className="mt-3 grid gap-2 text-sm leading-relaxed text-muted-foreground">
          <li>1. <strong className="text-foreground">Proxy-signal detection</strong> for callers without an authority score: domain-age via WHOIS, internal-graph density, named editorial leadership presence. Lets the engine make a credible authority guess on its own when the caller doesn&apos;t pass <code className="font-mono text-xs">--authority-score</code>.</li>
          <li>2. <strong className="text-foreground">Classifier confidence on catalog directories.</strong> Only 1 of 9 audited reputable sites was classified as <code className="font-mono text-xs">programmatic-directory</code> at ≥70% confidence. Improving the classifier is the largest remaining lever inside the engine itself.</li>
          <li>3. <strong className="text-foreground">A weak-pSEO calibration corpus</strong> to balance the reputable one. Future runs would assert reputable-PASS <em>and</em> weak-FLAG simultaneously, preventing single-axis drift.</li>
          <li>4. <strong className="text-foreground">Core Web Vitals</strong> (LCP/INP/CLS) via render-mode page-load instrumentation. Currently in tier-1 of the blind-spot audit; needs a render-time PerformanceObserver harness.</li>
          <li>5. <strong className="text-foreground">Residential-IP rendering proxy</strong> to add Zillow, Yelp, TripAdvisor, Indeed (currently excluded for CAPTCHA/403 walls).</li>
          <li>6. <strong className="text-foreground">Verdict-explanation strings anchored to outcomes</strong>: &quot;concerning means at this risk level, sites historically saw X% indexation loss after a Helpful Content rebuild&quot;: once we have enough longitudinal data.</li>
        </ol>
      </section>

      <section className="mt-14 rounded-[28px] border border-border/70 bg-card/40 p-7">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Verify any of this yourself
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground">
          The corpus, the runner, and every per-round result are committed
          to the public repository. Clone it, run{" "}
          <code className="font-mono text-xs">bun run scripts/calibration-reputable-pseo.ts</code>,
          and confirm or refute the table above. We treat the runner&apos;s
          output as the source of truth; this page is just a dated mirror.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="https://github.com/ouranos-labs/pseolint"
            className="inline-flex h-11 items-center rounded-[14px] bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            View on GitHub
          </a>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-[14px] border border-border-strong px-5 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Run an audit
          </Link>
        </div>
      </section>
      <SourcesSection
        sources={[
          {
            source: "spamPolicies",
            note: "Google's spam policies are the primary reference for the eight SpamBrain-aligned rule categories that pseolint's calibration corpus tests against.",
          },
          {
            source: "helpfulContent",
            note: "Google's helpful-content guidance underpins the calibration ceiling logic: sites that demonstrably win in search are expected to meet the originality and usefulness criteria described here.",
          },
          {
            source: "searchEssentials",
            note: "Google Search Essentials documents the technical requirements (canonical tags, crawlability, structured data) that several of pseolint's tech-bucket rules enforce and that the calibration data validates.",
          },
        ]}
      />
    </main>
    </>
  );
}
