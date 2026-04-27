// apps/web/src/app/dashboard/integrations/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getOptionalSession } from "@/lib/session";

export const runtime = "nodejs";

export default async function IntegrationsPage() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/integrations");
  const rows = await db.select().from(integrations).where(eq(integrations.userId, session.user.id));
  const has = (k: string) => rows.some((r) => r.kind === k);

  const yaml = `- run: npx pseolint audit ./out --format json --out report.json
- run: npx pseolint upload report.json --token \${{ secrets.PSEOLINT_TOKEN }} --domain-id <id>`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium text-foreground">Integrations</h1>
        <p className="mt-2 text-sm text-muted-foreground">Connect the systems that tell us when you ship.</p>
      </div>

      <section className="space-y-4">
        <Card title="Search Console" status={has("gsc") ? "connected" : "disconnected"}
              blurb="Cross-references our findings with real impressions. Rank the fix queue by traffic, not guesswork.">
          {has("gsc") ? <span className="text-xs text-success">Connected</span> : (
            <button className="rounded-[14px] border border-border-strong px-3 py-1.5 text-xs" disabled>
              Connect (coming soon — OAuth verification pending)
            </button>
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
