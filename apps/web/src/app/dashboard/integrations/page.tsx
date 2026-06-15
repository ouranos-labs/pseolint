import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { GscConnectButton } from "@/components/dashboard/gsc-connect-button";

export const runtime = "nodejs";

type BannerTone = "success" | "warning" | "destructive";

const STATUS_BANNERS: Record<string, { tone: BannerTone; text: string }> = {
  disconnected: { tone: "warning", text: "Search Console disconnected. Bound properties have been unlinked." },
  denied: { tone: "warning", text: "Search Console authorization was cancelled." },
  exchange_failed: { tone: "destructive", text: "Couldn't complete the connection — try again, or check that the redirect URI is whitelisted in Google Cloud Console." },
  state_invalid: { tone: "destructive", text: "OAuth state was invalid or expired. Please retry." },
  state_mismatch: { tone: "destructive", text: "OAuth state did not match the signed-in user. Please retry." },
  missing_params: { tone: "destructive", text: "OAuth response was missing required parameters." },
};

/**
 * Build the post-connection banner from auto-bind counts. Surfaces what got
 * paired automatically vs what still needs the user's attention — the silent
 * "connected ✓" we used to show was the worst possible feedback because it
 * implied the binding step was done when it usually wasn't.
 */
function buildConnectedBanner(bound: number, ambiguous: number, unmatched: number): { tone: BannerTone; text: string } {
  if (bound === 0 && ambiguous === 0 && unmatched === 0) {
    // No monitored domains yet — they'll get auto-bound as they're added.
    return { tone: "success", text: "Search Console connected. Domains you add will be auto-paired with their matching property." };
  }
  if (bound > 0 && ambiguous === 0 && unmatched === 0) {
    return {
      tone: "success",
      text: `Search Console connected · auto-bound ${bound} domain${bound === 1 ? "" : "s"}. Findings now ranked by traffic-at-risk.`,
    };
  }
  const parts: string[] = [];
  if (bound > 0) parts.push(`auto-bound ${bound}`);
  if (ambiguous > 0) parts.push(`${ambiguous} ambiguous (multiple properties match — pick one in domain settings)`);
  if (unmatched > 0) parts.push(`${unmatched} without a matching property`);
  return {
    tone: bound > 0 ? "success" : "warning",
    text: `Search Console connected · ${parts.join(" · ")}.`,
  };
}

export default async function IntegrationsPage({
  searchParams,
}: { searchParams: Promise<{ gsc?: string; bound?: string; ambiguous?: string; unmatched?: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/integrations");
  const plan = await getPlan(session.user.id);
  const { gsc: gscStatus, bound: boundParam, ambiguous: ambiguousParam, unmatched: unmatchedParam } = await searchParams;

  const [gscRow] = await db.select({ id: integrations.id, lastSyncAt: integrations.lastSyncAt, createdAt: integrations.createdAt })
    .from(integrations)
    .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc")))
    .limit(1);
  const gscConnected = Boolean(gscRow);

  const yaml = `- run: npx pseolint audit ./out --format json --out report.json
- run: npx pseolint upload report.json --token \${{ secrets.PSEOLINT_TOKEN }} --domain-id <id>`;

  const banner =
    gscStatus === "connected"
      ? buildConnectedBanner(
          parseInt(boundParam ?? "0", 10) || 0,
          parseInt(ambiguousParam ?? "0", 10) || 0,
          parseInt(unmatchedParam ?? "0", 10) || 0,
        )
      : gscStatus
      ? STATUS_BANNERS[gscStatus]
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium text-foreground">Integrations</h1>
        <p className="mt-2 text-sm text-muted-foreground">Connect the systems that tell us when you ship.</p>
      </div>

      {banner && (
        <div className={
          `rounded-[14px] border px-4 py-3 text-sm ` +
          (banner.tone === "success" ? "border-success/40 bg-success/5 text-success"
           : banner.tone === "warning" ? "border-warning/40 bg-warning/5 text-warning"
           : "border-destructive/40 bg-destructive/5 text-destructive")
        }>
          {banner.text}
        </div>
      )}

      <section className="space-y-4">
        <Card title="Search Console" status={gscConnected ? "connected" : "disconnected"}
              blurb="Pulls real impressions per page so a finding on a 300k-impression template outranks one on a page nobody visits.">
          <RankComparison />
          {gscConnected ? (
            <div className="mt-4 flex flex-col gap-2">
              <span className="text-xs text-success">
                Connected{gscRow.lastSyncAt ? ` · last sync ${new Date(gscRow.lastSyncAt).toLocaleString()}` : " · awaiting first sync"}
              </span>
              <p className="text-xs text-muted-foreground">
                Each domain still needs a property bound — open a domain → Settings → GSC property.
              </p>
              <form action="/api/integrations/gsc/disconnect" method="post">
                <button type="submit" className="rounded-[14px] border border-destructive/50 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                  Disconnect
                </button>
              </form>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              <GscConnectButton />
              <p className="text-[11px] text-muted-foreground">
                Read-only scope (<code className="font-mono">webmasters.readonly</code>). Tokens encrypted at rest.
                You can disconnect any time.
              </p>
            </div>
          )}
        </Card>

        <Card title="Google Indexing API" status={gscConnected ? "connected" : "disconnected"}
              blurb="Request instant crawl for high-quality audited pages via Google's URL Indexing API. Gated by pseolint quality requirements.">
          {plan === "pro" ? (
            gscConnected ? (
              <div className="mt-2 text-sm text-muted-foreground flex flex-col gap-2">
                <span className="text-xs text-success">
                  Connected via Google Search Console integration.
                </span>
                <p>
                  You are ready to push high-quality pages to the Google Indexing API. 
                  Select a domain from your dashboard to start pushing URLs.
                </p>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Connect your Google Search Console account above to enable programmatic indexing.
                </p>
              </div>
            )

          ) : (
            <div className="relative mt-2 overflow-hidden rounded-[14px] border border-primary/20 bg-primary/5 p-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                    Pro Feature
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-foreground">Programmatic Google Indexing</h3>
                <p className="text-xs text-muted-foreground">
                  Get your new and updated pages indexed by Google in minutes rather than weeks. Set up automated GSC pushes.
                </p>
                <a
                  href="/pricing"
                  className="mt-2 inline-flex w-fit h-9 items-center rounded-[12px] bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Upgrade to Pro →
                </a>
              </div>
            </div>
          )}
        </Card>

        <Card title="GitHub Action" status="recipe"
              blurb="Run audits on every PR. Upload results here for cross-run history + regression trends.">
          <pre className="overflow-x-auto rounded-[12px] bg-muted p-4 text-xs">{yaml}</pre>
          <p className="mt-2 text-xs text-muted-foreground">
            You&apos;ll need an upload token — <Link href="/dashboard/settings/tokens" className="text-primary hover:underline">create one</Link>.
          </p>
        </Card>

        <Card title="Daily diff-audit" status="active"
              blurb="On by default for every monitored domain. No setup required.">
          <span className="text-xs text-success">Active</span>
        </Card>

        <Card title="Webflow webhook" status="coming-soon"
              blurb="Audit collections when you publish a new batch of items.">
          <span className="text-xs text-muted-foreground">Ships in v1.1.</span>
        </Card>

        <Card title="WordPress plugin" status="coming-soon"
              blurb="Audit posts and taxonomies on publish. Installed from the WP plugin directory.">
          <span className="text-xs text-muted-foreground">Ships in v1.2.</span>
        </Card>
      </section>
    </div>
  );
}

function Card({ title, status, blurb, children }: { title: string; status: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-border/70 bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{status}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * Concrete before/after example. Two findings of the same severity rank
 * very differently once impressions are factored in — without GSC the engine
 * can't know one template gets 312k impressions and the other gets 90.
 */
function RankComparison() {
  return (
    <div className="grid gap-3 rounded-[14px] border border-border/60 bg-background/40 p-3 sm:grid-cols-2">
      <ComparisonColumn
        eyebrow="Without GSC"
        sub="rank = severity × pages"
        rows={[
          { rank: 1, ruleId: "marketing/thin-content", template: "/locations/:city", note: "tied" },
          { rank: 2, ruleId: "marketing/thin-content", template: "/admin/preview/:id", note: "tied" },
        ]}
        muted
      />
      <ComparisonColumn
        eyebrow="With GSC"
        sub="rank = log(impressions) × severity × pages"
        rows={[
          { rank: 1, ruleId: "marketing/thin-content", template: "/locations/:city", note: "312k impressions" },
          { rank: 2, ruleId: "marketing/thin-content", template: "/admin/preview/:id", note: "90 impressions" },
        ]}
      />
    </div>
  );
}

function ComparisonColumn({
  eyebrow,
  sub,
  rows,
  muted = false,
}: {
  eyebrow: string;
  sub: string;
  rows: { rank: number; ruleId: string; template: string; note: string }[];
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
        <p className="font-mono text-[10px] text-muted-foreground/80">{sub}</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li
            key={r.rank}
            className={`flex items-baseline gap-2 rounded-[10px] border px-2.5 py-1.5 text-xs ${
              muted ? "border-border/40 bg-card/30" : "border-border/60 bg-card/60"
            }`}
          >
            <span className={`font-mono text-[10px] ${muted ? "text-muted-foreground" : "text-success"}`}>
              {muted ? "~" : "↑"}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">#{r.rank}</span>
            <code className="truncate font-mono text-[10px] text-foreground">{r.template}</code>
            <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">{r.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
