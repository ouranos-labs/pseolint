import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { audits, seedStats, leaderboardClaims } from "@/db/schema";
import { and, eq, gt, lt, isNotNull, sql, inArray } from "drizzle-orm";
import { LEADERBOARD_RISK_MAX, LEADERBOARD_MIN_PAGES } from "@/lib/leaderboard";
import { env } from "@/lib/env";
import { GradeChip } from "@/components/audit/grade-chip";
import { SiteThumbnail } from "@/components/audit/site-thumbnail";
import { TrackedLink } from "@/components/analytics/tracked-link";
import { SourcesSection } from "@/components/marketing/sources-section";

export const runtime = "nodejs";
export const revalidate = 600;

export const metadata: Metadata = {
  title: "pSEO Leaderboard: top-scoring programmatic SEO sites · pseolint",
  description:
    "Public ranking of programmatic SEO sites by their pseolint score. See which sites pass SpamBrain rules and which trip the most thin-content and doorway-pattern findings.",
  alternates: { canonical: `${env().BETTER_AUTH_URL}/leaderboard` },
};

/**
 * Escape `</` sequences inside a JSON-LD payload so a stray closing tag inside
 * a string can't terminate the surrounding `<script>` block. Inputs here are
 * server-derived but safely escaped: same helper pattern as rules/tools pages.
 */
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

const CATEGORY_BREAKDOWN: Array<{ key: string; weight: string; blurb: string }> = [
  {
    key: "spam",
    weight: "33%",
    blurb:
      "Doorway pages, scaled abuse, thin-content templates: the patterns SpamBrain targets directly.",
  },
  {
    key: "content",
    weight: "19%",
    blurb:
      "Coverage breadth, helpful-content depth, evidence of expertise rather than filler boilerplate.",
  },
  {
    key: "aeo",
    weight: "14%",
    blurb:
      "Answer-engine readiness: answer-first paragraphs, citable facts, modular self-contained sections.",
  },
  {
    key: "links",
    weight: "11%",
    blurb:
      "Internal linking sanity, anchor diversity, no orphaned pages or stuffed footer link farms.",
  },
  {
    key: "tech",
    weight: "7%",
    blurb: "Crawlability, status codes, render-blocking assets, sitemap and robots hygiene.",
  },
  {
    key: "data",
    weight: "6%",
    blurb:
      "Data-source freshness and citation: does the page back up its claims with verifiable inputs?",
  },
  {
    key: "schema",
    weight: "5%",
    blurb: "Structured data correctness, valid JSON-LD, no spammy or misleading markup.",
  },
  {
    key: "cannibal",
    weight: "5%",
    blurb:
      "Keyword cannibalisation: multiple pages competing for the same query without differentiation.",
  },
];

export default async function Leaderboard() {
  // Database-level deduplication, one query, no JS-level starvation: pick the
  // newest completed public audit per host FIRST, then apply the quality bars
  // to that winner. Re-sorted by risk in JS afterwards for display.
  //
  // Filtering before DISTINCT ON is what the previous version did, and it does
  // not mean what the old comment claimed. DISTINCT ON runs over the FILTERED
  // set, so a host whose newest audit fails the bar simply falls back to its
  // most recent PASSING audit: the site keeps its old good score instead of
  // dropping off, and the leaderboard publishes a number the site no longer
  // earns. Selecting the winner first makes a degraded site disappear, which is
  // the documented intent.
  const latestPerHost = db
    .selectDistinctOn([audits.host], {
      id: audits.id,
      slug: audits.slug,
      sourceUrl: audits.sourceUrl,
      host: audits.host,
      source: audits.source,
      risk: audits.risk,
      pageCount: audits.pageCount,
      createdAt: audits.createdAt,
      expiresAt: audits.expiresAt,
      ogTitle: audits.ogTitle,
      ogDescription: audits.ogDescription,
      ogImageUrl: audits.ogImageUrl,
    })
    .from(audits)
    .where(
      and(
        eq(audits.isPublic, true),
        eq(audits.status, "completed"),
        // Identity only: which row REPRESENTS this host. Non-null and non-empty
        // host mirrors isLeaderboardEligible() in @/lib/leaderboard, keeping
        // this gate in lockstep with the report page's reportRobots() so a row
        // can't be listed-but-noindexed.
        isNotNull(audits.host),
        sql`length(${audits.host}) > 0`,
      ),
    )
    .orderBy(audits.host, sql`${audits.createdAt} DESC`)
    .as("latest_per_host");

  const rows = await db
    .select({
      id: latestPerHost.id,
      slug: latestPerHost.slug,
      sourceUrl: latestPerHost.sourceUrl,
      host: latestPerHost.host,
      source: latestPerHost.source,
      risk: latestPerHost.risk,
      pageCount: latestPerHost.pageCount,
      createdAt: latestPerHost.createdAt,
      ogTitle: latestPerHost.ogTitle,
      ogDescription: latestPerHost.ogDescription,
      ogImageUrl: latestPerHost.ogImageUrl,
    })
    .from(latestPerHost)
    .where(
      and(
        isNotNull(latestPerHost.risk),
        lt(latestPerHost.risk, LEADERBOARD_RISK_MAX),
        gt(latestPerHost.expiresAt, new Date()),
        sql`${latestPerHost.pageCount} >= ${LEADERBOARD_MIN_PAGES}`,
      ),
    )
    .limit(100);

  // Re-sort by risk ascending for leaderboard display order.
  type Row = (typeof rows)[number];
  const deduped = rows.sort((a: Row, b: Row) => (a.risk ?? 100) - (b.risk ?? 100) || a.createdAt.getTime() - b.createdAt.getTime());

  const [stats] = await db.select().from(seedStats).limit(1);

  const claimHosts = deduped.map((r: Row) => r.host).filter((h): h is string => !!h);
  const claimRows = claimHosts.length
    ? await db.select().from(leaderboardClaims).where(inArray(leaderboardClaims.host, claimHosts))
    : [];
  const claimByHost = new Map(claimRows.map((c) => [c.host, c]));
  // Drop owner-hidden listings; apply OG overrides; flag verified.
  const visible = deduped
    .filter((r: Row) => !claimByHost.get(r.host ?? "")?.isHidden)
    .map((r: Row) => {
      const c = claimByHost.get(r.host ?? "");
      return {
        ...r,
        ogTitle: c?.ogTitleOverride ?? r.ogTitle,
        ogDescription: c?.ogDescriptionOverride ?? r.ogDescription,
        verified: !!c,
      };
    });

  const baseUrl = env().BETTER_AUTH_URL.replace(/\/$/, "");
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "pSEO Leaderboard",
    description:
      "Public ranking of programmatic SEO sites scored by the pseolint engine with site-type-aware SpamBrain + AEO weights. Lower scores indicate lower SpamBrain risk.",
    url: `${baseUrl}/leaderboard`,
    isPartOf: {
      "@type": "WebSite",
      name: "pseolint",
      url: baseUrl,
    },
    about: {
      "@type": "Thing",
      name: "Programmatic SEO quality scoring",
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: visible.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: visible.slice(0, 25).map((r, i: number) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${baseUrl}/r/${r.slug}`,
        name: r.host,
      })),
    },
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <script
        type="application/ld+json"
        // JSON-LD is built from server-side audit rows; safeJsonLd escapes `<`
        // so no string can prematurely close the surrounding script tag. Same
        // pattern as rules/page.tsx and tools/page.tsx.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={ { __html: safeJsonLd(collectionJsonLd) } }
      />

      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Leaderboard</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          The cleanest pSEO sites on record.
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Lower is safer. Ranked by SpamBrain risk score, one entry per domain. Methodology
          and category breakdown below the table.
        </p>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          { visible.length === 0 ? "Be the first on the board" : "Current rankings" }
        </h2>
        { visible.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-border bg-card/30 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No public audits have completed yet. The leaderboard populates automatically as
              users run public audits: start one from the homepage and you&rsquo;ll claim
              position #1 by default.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Run a public audit
            </Link>
          </div>
        ) : (
          // CSS-columns masonry: cards flow top-to-bottom down each column and
          // pack with no gaps, which is the waterfall look this board wants.
          //
          // That flow is also why the cards carry NO rank number. Column-major
          // fill put 1/2/3 down the left edge while the top row read 1, 4, 7, so
          // the badge actively contradicted the layout; a grid reads correctly
          // left-to-right but leaves dead space under every short card. Rather
          // than print a number the eye cannot follow, the ordering is carried by
          // the sort (risk ascending) and by each card's own grade chip. The
          // JSON-LD ItemList below still emits real `position` values, so the
          // machine-readable ranking is unaffected.
          <div className="mt-4 flex flex-col gap-4 sm:block sm:columns-2 lg:columns-3">
            { visible.map((r) => {
              const host = r.host!;
              return (
                <article
                  key={ r.id }
                  className="relative break-inside-avoid overflow-hidden rounded-[20px] border border-border/70 bg-card/50 p-1.5 backdrop-blur-sm transition-colors hover:border-primary/40 shadow-sm sm:mb-4"
                >
                  { r.source === "seed" && (
                    <span className="absolute left-3 top-3 z-10 inline-flex items-center rounded-[8px] bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-primary shadow-sm">
                      Notable
                    </span>
                  ) }
                  { r.verified && (
                    <span className="absolute left-3 bottom-3 z-10 inline-flex items-center gap-0.5 rounded-[8px] bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-success shadow-sm">
                      ✓ verified
                    </span>
                  ) }

                  <SiteThumbnail host={ host } imageUrl={ r.ogImageUrl } />

                  <h3 className="mt-1 mx-1 text-base font-semibold tracking-tight">
                    <TrackedLink
                      href={ `/r/${r.slug}` }
                      event={{ name: "leaderboard_entry_clicked", props: { host } }}
                      className="text-foreground transition-colors hover:text-primary hover:underline"
                    >
                      { host }
                    </TrackedLink>
                  </h3>
                  <p className="mt-0.5 mx-1 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                    { r.ogDescription || `Audited ${r.pageCount ?? "—"} ${r.pageCount === 1 ? "page" : "pages"} · scored ${timeAgo(r.createdAt)} ago.` }
                  </p>

                  <div className="mt-4 mr-2 flex items-center justify-end">
                    <GradeChip risk={ r.risk } />
                  </div>
                </article>
              );
            }) }
          </div>
        ) }

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <span className="font-mono uppercase tracking-wider text-muted-foreground/80">Grades</span>
          <GradeKey letter="A" tone="text-success" desc="0–19" />
          <GradeKey letter="B" tone="text-success/80" desc="20–39" />
          <GradeKey letter="C" tone="text-warning" desc="40–59" />
          <GradeKey letter="D" tone="text-warning" desc="60–79" />
          <GradeKey letter="F" tone="text-destructive" desc="80+" />
          <span className="ml-auto">Lower = safer</span>
        </div>
      </section>

      <p className="mt-12 max-w-2xl text-sm text-muted-foreground">
        Leaderboard methodology in one paragraph: the ranking is rebuilt every 10 minutes from
        completed public audits, deduplicated by hostname so a domain occupies exactly one slot:
        the most recent audit per domain wins, so a re-audit supersedes the prior score. Only sites
        scoring in the A or B band (risk below 40) are listed; audits below the 5-page floor are
        excluded because too-small samples produce volatile rankings. Pages marked private by their
        owner never appear, regardless of score. A clean public audit (including an anonymous one) 
        is kept permanently and shown with the date it was scored; if a site is re-audited and slips
        below the bar, it drops off the board. The board first shipped on March 15, 2026 alongside the
        v0.4.0 engine cut, and the scoring weights were last rebalanced on April 21, 2026 when the AEO
        category landed.
          { stats && stats.auditedCount > 0 ? (
            <>
              { " " }To bootstrap the board we also track{ " " }
              <span className="text-foreground">{ stats.auditedCount }</span> well-known
              programmatic-SEO sites; <span className="text-foreground">{ stats.passedCount }</span>{ " " }
              currently land in the A/B band{ stats.medianRisk !== null ? <> (median score { stats.medianRisk })</> : null }.
              Only the clean ones are named here.
            </>
          ) : null }
      </p>

      <section className="mt-10 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          The pseolint leaderboard ranks programmatic SEO sites by their composite{ " " }
          <span className="text-foreground">risk score</span>: a 0-to-100 number where lower
          is better. The score is a weighted aggregate of findings across{ " " }
          <span className="text-foreground">SpamBrain + AEO rules</span> weighted by your site's
          archetype (programmatic-directory, blog, ecommerce, docs, small-marketing). Each finding
          contributes severity- and confidence-weighted points; the site-type profile decides which
          rule families dominate the final score.
        </p>
        <p>
          The dominant signal is the spam category, weighted at{ " " }
          <span className="text-foreground">33%</span>, because doorway-style scaled abuse is
          what Google&rsquo;s SpamBrain classifier targets most aggressively on programmatic
          sites. Content quality contributes 19%, AEO readiness 14%, internal links 11%, and
          the rest (tech, data, schema, cannibal) divide the remaining 22%. A site that ships
          clean templates with real answers can finish well below 30 even at scale; a thin
          doorway farm will rarely score below 60.
        </p>
        <p>
          We publish the leaderboard so operators can benchmark against peers without paying
          for opaque enterprise dashboards. It also demonstrates that the engine produces
          stable, repeatable results: the same site audited twice in a week should land within
          a few points. If your audit tells a different story than your traffic, that&rsquo;s
          a signal worth investigating: usually a templating regression or a recently
          shipped doorway pattern.
        </p>
        <p>
          Ranges to keep in mind:{ " " }
          <span className="text-foreground">A = 0&ndash;19 (ready)</span>,{ " " }
          <span className="text-foreground">B = 20&ndash;39 (good)</span>,{ " " }
          <span className="text-foreground">C = 40&ndash;59 (concerning)</span>,{ " " }
          <span className="text-foreground">D = 60&ndash;79 (severe)</span>,{ " " }
          <span className="text-foreground">F = 80+ (critical)</span>. Anything in the A
          band is healthy enough that we wouldn&rsquo;t expect manual-action exposure on the
          SpamBrain axis. C-band sites are where most undermaintained pSEO domains live; D and
          F is where deindexation events tend to start. The thresholds were calibrated against
          the August 2022 helpful-content rollout and the March 2024 core update, so a site
          that lands in the A band today should also have been clean against those historical
          baselines.
        </p>
      </section>

      <section className="mt-12 rounded-[28px] border border-border bg-card/40 p-6 sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          How sites end up on this leaderboard
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Any audit a user runs with{ " " }
          <span className="font-mono text-foreground">isPublic = true</span> is listed once it
          completes, crosses the 5-page minimum, and scores in the A or B band (risk below 40).
          Free-tier audits cost $0 and default to public; that&rsquo;s the trade for unlimited
          one-shot acquisition runs, capped at 3 audits per browser per 24-hour window. Audits that
          score below the bar still produce a full report at their own URL; they just aren&rsquo;t
          listed publicly. Pro plans start at $19/mo, default to private, and stay private until an
          operator publishes the site from its dashboard page, under{ " " }
          <span className="font-mono text-foreground">Site visibility</span>. That choice belongs to
          the site, not to a single report, so every later re-audit keeps it.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Listings are deduplicated by hostname: the most recent audit per domain shows, and
          rankings refresh every ten minutes. A clean public listing is kept permanently; re-auditing
          a site supersedes its previous entry. If you ran a public audit you didn&rsquo;t mean to
          share, mark it private from your dashboard and it disappears at the next revalidation.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Scoring methodology
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Audits crawl up to <span className="text-foreground">200 pages on the free tier</span>{ " " }
          and <span className="text-foreground">500 on Pro (manual re-audits)</span>, sampling URLs from the
          sitemap and the homepage&rsquo;s outbound links. Render mode is opt-in via the{ " " }
          <span className="font-mono text-foreground">--render</span> flag: useful for SPA
          frameworks that hydrate content client-side, but skipped by default to keep audits
          fast and deterministic. Each sampled page runs through every rule in the engine, and
          findings are bucketed by severity.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The score is computed by summing severity weights (critical = 40, error = 25,
          warning = 12, info = 5) per category, capping each category at 100, then
          multiplying by the fixed category weight and summing. The 8 spam/* rules and 8
          aeo/* rules are the biggest individual contributors because they map directly to
          the patterns search and answer engines penalise. A clean, well-templated site can
          run hundreds of pages and still land in the A or B band; a site that trips even
          one critical doorway rule across many pages will jump into the C/D band quickly.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          { CATEGORY_BREAKDOWN.map((cat) => (
            <li
              key={ cat.key }
              className="rounded-2xl border border-border/70 bg-card/40 p-4 text-sm"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono font-semibold text-foreground">{ cat.key }</span>
                <span className="text-xs text-muted-foreground">{ cat.weight }</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{ cat.blurb }</p>
            </li>
          )) }
        </ul>
      </section>
      <SourcesSection
        sources={ [
          {
            source: "spamPolicies",
            note: "Each domain's risk score is computed from rules that operationalise Google's published spam policies, so a low score reflects distance from documented scaled-content, doorway, and reputation-abuse violations.",
          },
          {
            source: "scaledContent",
            note: "Programmatic-directory entrants are scored against the scaled-content-abuse criteria, the policy that separates a genuinely useful template grid from one mass-produced for search alone.",
          },
          {
            source: "helpfulContent",
            note: "Only sites that read as people-first under Google's helpful-content guidance hold the top, clean-corpus ranks; the leaderboard indexes that distinction rather than raw traffic.",
          },
        ] }
      />
    </main>
  );
}

function GradeKey({ letter, tone, desc }: { letter: string; tone: string; desc: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={ `font-mono text-[10px] font-bold ${tone}` }>{ letter }</span>
      <span className="text-muted-foreground/80">{ desc }</span>
    </span>
  );
}

/** Tight relative-time label for card descriptions. Server-rendered at revalidate boundary. */
function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}


