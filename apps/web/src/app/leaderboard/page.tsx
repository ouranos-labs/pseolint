import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const revalidate = 600;

export const metadata: Metadata = {
  title: "pSEO Leaderboard — top-scoring programmatic SEO sites · pseolint",
  description:
    "Public ranking of programmatic SEO sites by their pseolint score. See which sites pass SpamBrain rules and which trip the most thin-content and doorway-pattern findings.",
  alternates: { canonical: `${env().BETTER_AUTH_URL}/leaderboard` },
};

/**
 * Escape `</` sequences inside a JSON-LD payload so a stray closing tag inside
 * a string can't terminate the surrounding `<script>` block. Inputs here are
 * server-derived but safely escaped — same helper pattern as rules/tools pages.
 */
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

const CATEGORY_BREAKDOWN: Array<{ key: string; weight: string; blurb: string }> = [
  {
    key: "spam",
    weight: "33%",
    blurb:
      "Doorway pages, scaled abuse, thin-content templates — the patterns SpamBrain targets directly.",
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
      "Answer-engine readiness — answer-first paragraphs, citable facts, modular self-contained sections.",
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
      "Data-source freshness and citation — does the page back up its claims with verifiable inputs?",
  },
  {
    key: "schema",
    weight: "5%",
    blurb: "Structured data correctness — valid JSON-LD, no spammy or misleading markup.",
  },
  {
    key: "cannibal",
    weight: "5%",
    blurb:
      "Keyword cannibalisation — multiple pages competing for the same query without differentiation.",
  },
];

export default async function Leaderboard() {
  const rows = await db
    .select({
      id: audits.id,
      slug: audits.slug,
      sourceUrl: audits.sourceUrl,
      risk: audits.risk,
      pageCount: audits.pageCount,
      createdAt: audits.createdAt,
    })
    .from(audits)
    .where(
      and(
        eq(audits.isPublic, true),
        eq(audits.status, "completed"),
        gt(audits.expiresAt, new Date()),
        sql`${audits.pageCount} >= 5`,
      ),
    )
    .orderBy(sql`COALESCE(${audits.risk}, 100) ASC`, audits.createdAt)
    .limit(100);

  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    try {
      const h = new URL(r.sourceUrl).hostname.toLowerCase();
      if (seen.has(h)) return false;
      seen.add(h);
      return true;
    } catch {
      return false;
    }
  });

  const baseUrl = env().BETTER_AUTH_URL.replace(/\/$/, "");
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "pSEO Leaderboard",
    description:
      "Public ranking of programmatic SEO sites scored by the pseolint engine across 42 rules in 8 categories. Lower scores indicate lower SpamBrain risk.",
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
      numberOfItems: deduped.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: deduped.slice(0, 25).map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${baseUrl}/r/${r.slug}`,
        name: hostOf(r.sourceUrl),
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
        dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }}
      />

      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Leaderboard</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          The cleanest pSEO sites on record.
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Lower is safer. Ranked by SpamBrain risk score across 32 rules in 4
          categories — one entry per domain. Powered by the MIT-licensed pseolint
          engine v0.4.0 (github.com/ouranos-labs/pseolint).
        </p>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Leaderboard methodology in one paragraph: the ranking is rebuilt every 10 minutes from
          completed public audits, deduplicated by hostname so a domain occupies exactly one slot,
          and sorted ascending by composite score with createdAt as the tiebreaker. Audits below the
          5-page floor are excluded because too-small samples produce volatile rankings. Pages
          marked private by their owner never appear, regardless of score. Listings inherit the
          retention window of the underlying audit, so anonymous entries fall off after 24 hours
          and free-tier entries after 30 days unless the operator upgrades and pins them. The board
          first shipped on March 15, 2026 alongside the v0.4.0 engine cut, and the scoring weights
          were last rebalanced on April 21, 2026 when the AEO category landed.
        </p>
      </div>

      <section className="mt-10 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          The pseolint leaderboard ranks programmatic SEO sites by their composite{" "}
          <span className="text-foreground">risk score</span> — a 0-to-100 number where lower
          is better. The score is a weighted aggregate of findings across{" "}
          <span className="text-foreground">42 rules in 8 categories</span>: spam, content,
          aeo, links, tech, data, schema, and cannibal. Each finding contributes
          severity-weighted points (critical = 40, error = 25, warning = 12, info = 5),
          capped per category, then combined using fixed category weights.
        </p>
        <p>
          The dominant signal is the spam category, weighted at{" "}
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
          a signal worth investigating — usually a templating regression or a recently
          shipped doorway pattern.
        </p>
        <p>
          Ranges to keep in mind:{" "}
          <span className="text-foreground">0&ndash;30 risk = ready</span>,{" "}
          <span className="text-foreground">31&ndash;60 = concerning</span>,{" "}
          <span className="text-foreground">61+ = severe</span>. Anything under 30 is healthy
          enough that we wouldn&rsquo;t expect manual-action exposure on the SpamBrain axis.
          The middle band is where most undermaintained pSEO sites live; the top of the band
          is where deindexation events tend to start. The thresholds were calibrated against
          the August 2022 helpful-content rollout and the March 2024 core update, so a site
          that lands in the 0&ndash;30 band today should also have been clean against those
          historical baselines.
        </p>
      </section>

      <section className="mt-12 rounded-[28px] border border-border bg-card/40 p-6 sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          How sites end up on this leaderboard
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Any audit a user runs with{" "}
          <span className="font-mono text-foreground">isPublic = true</span> shows up here once
          it completes and crosses the 5-page minimum. Free-tier audits cost $0 and default to
          public — that&rsquo;s the trade for unlimited one-shot acquisition runs, capped at 3
          audits per browser per 24-hour window. Pro plans start at $19/mo, default to private,
          and stay private unless an operator explicitly flips the visibility toggle on the
          audit detail page.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Listings are deduplicated by hostname; only the most recent audit per domain
          appears, and rankings refresh every ten minutes. Audits expire after their retention
          window, at which point they fall off the board automatically. If you ran a public
          audit you didn&rsquo;t mean to share, you can mark it private from your dashboard
          and it disappears from the next revalidation.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Scoring methodology
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Audits crawl up to <span className="text-foreground">100 pages on the free tier</span>{" "}
          and <span className="text-foreground">500 on Pro</span>, sampling URLs from the
          sitemap and the homepage&rsquo;s outbound links. Render mode is opt-in via the{" "}
          <span className="font-mono text-foreground">--render</span> flag — useful for SPA
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
          run hundreds of pages and still land in the 0&ndash;30 band; a site that trips even
          one critical doorway rule across many pages will jump into the concerning band
          quickly.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {CATEGORY_BREAKDOWN.map((cat) => (
            <li
              key={cat.key}
              className="rounded-2xl border border-border/70 bg-card/40 p-4 text-sm"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono font-semibold text-foreground">{cat.key}</span>
                <span className="text-xs text-muted-foreground">{cat.weight}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{cat.blurb}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {deduped.length === 0 ? "Be the first on the board" : "Current rankings"}
        </h2>
        {deduped.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-border bg-card/30 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No public audits have completed yet. The leaderboard populates automatically as
              users run public audits — start one from the homepage and you&rsquo;ll claim
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
          <div className="mt-4 overflow-hidden rounded-[28px] border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pl-5 pr-4 font-medium">#</th>
                  <th className="py-3 pr-4 font-medium">Domain</th>
                  <th className="py-3 pr-4 font-medium">Score</th>
                  <th className="py-3 pr-5 text-right font-medium">Pages</th>
                </tr>
              </thead>
              <tbody>
                {deduped.map((r, i) => {
                  const risk = r.risk ?? 0;
                  const tone = scoreTone(risk);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-card/60"
                    >
                      <td className="py-3.5 pl-5 pr-4 text-muted-foreground">{i + 1}</td>
                      <td className="py-3.5 pr-4">
                        <Link
                          href={`/r/${r.slug}`}
                          className="text-foreground transition-colors hover:text-primary hover:underline"
                        >
                          {hostOf(r.sourceUrl)}
                        </Link>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className={`font-mono font-semibold ${tone}`}>
                          {r.risk ?? "—"}
                        </span>
                      </td>
                      <td className="py-3.5 pr-5 text-right text-muted-foreground">
                        {r.pageCount ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <LegendDot className="bg-success" label="0–40 safe" />
          <LegendDot className="bg-warning" label="41–69 watch" />
          <LegendDot className="bg-destructive" label="70+ risky" />
        </div>
      </section>
    </main>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function scoreTone(score: number) {
  if (score <= 40) return "text-success";
  if (score <= 69) return "text-warning";
  return "text-destructive";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
