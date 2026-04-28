// apps/web/src/app/dashboard/integrations/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getOptionalSession } from "@/lib/session";

export const runtime = "nodejs";

const STATUS_BANNERS: Record<string, { tone: "success" | "warning" | "destructive"; text: string }> = {
  connected: { tone: "success", text: "Search Console connected. Pick a property in each domain's settings to start ranking by traffic." },
  disconnected: { tone: "warning", text: "Search Console disconnected. Bound properties have been unlinked." },
  denied: { tone: "warning", text: "Search Console authorization was cancelled." },
  exchange_failed: { tone: "destructive", text: "Couldn't complete the connection — try again, or check that the redirect URI is whitelisted in Google Cloud Console." },
  state_invalid: { tone: "destructive", text: "OAuth state was invalid or expired. Please retry." },
  state_mismatch: { tone: "destructive", text: "OAuth state did not match the signed-in user. Please retry." },
  missing_params: { tone: "destructive", text: "OAuth response was missing required parameters." },
};

export default async function IntegrationsPage({
  searchParams,
}: { searchParams: Promise<{ gsc?: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/integrations");
  const { gsc: gscStatus } = await searchParams;

  const [gscRow] = await db.select({ id: integrations.id, lastSyncAt: integrations.lastSyncAt, createdAt: integrations.createdAt })
    .from(integrations)
    .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc")))
    .limit(1);
  const gscConnected = Boolean(gscRow);

  const yaml = `- run: npx pseolint audit ./out --format json --out report.json
- run: npx pseolint upload report.json --token \${{ secrets.PSEOLINT_TOKEN }} --domain-id <id>`;

  const banner = gscStatus ? STATUS_BANNERS[gscStatus] : null;

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
              blurb="Cross-references our findings with real impressions. Rank the fix queue by traffic, not guesswork.">
          {gscConnected ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-success">Connected{gscRow.lastSyncAt ? ` · last sync ${new Date(gscRow.lastSyncAt).toLocaleString()}` : " · awaiting first sync"}</span>
              <p className="text-xs text-muted-foreground">
                Bind a Search Console property per domain in <Link href="/dashboard" className="text-primary hover:underline">portfolio</Link> → settings.
              </p>
              <form action="/api/integrations/gsc/disconnect" method="post">
                <button type="submit" className="rounded-[14px] border border-destructive/50 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                  Disconnect
                </button>
              </form>
            </div>
          ) : (
            <a href="/api/integrations/gsc/connect"
               className="inline-flex items-center rounded-[14px] border border-border-strong bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              Connect with Google
            </a>
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
    <div className="rounded-[22px] border border-border/70 bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{status}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
