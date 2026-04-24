import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, integrations, domainDataSources, domainRuleOverrides } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import {
  updateDomainSettingsAction,
  uploadDataSourceAction,
  removeDataSourceAction,
  updateRuleOverridesAction,
} from "./actions";

export default async function DomainSettings({ params }: { params: Promise<{ host: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  if ((await getPlan(session.user.id)) !== "pro") redirect("/pricing");

  const { host: rawHost } = await params;
  const host = decodeURIComponent(rawHost);
  const [domain] = await db.select().from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    )).limit(1);
  if (!domain) notFound();

  const gscConns = await db.select().from(integrations)
    .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc")));

  const [dataSource] = await db.select().from(domainDataSources).where(eq(domainDataSources.domainId, domain.id)).limit(1);
  const [ruleOverride] = await db.select().from(domainRuleOverrides).where(eq(domainRuleOverrides.domainId, domain.id)).limit(1);

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <a href="/dashboard" className="hover:text-foreground">Portfolio</a>
        <span>/</span>
        <a href={`/dashboard/${encodeURIComponent(domain.host)}`} className="hover:text-foreground">{domain.host}</a>
        <span>/</span>
        <span className="text-foreground">Settings</span>
      </nav>
      <h1 className="text-xl font-medium">Settings — {domain.host}</h1>

      <form action={updateDomainSettingsAction} className="flex flex-col gap-5 rounded-[22px] border border-border/60 p-5">
        <input type="hidden" name="domainHost" value={domain.host} />

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Cadence</span>
          <span className="text-xs text-muted-foreground">Daily diff-audit · Weekly full re-audit</span>
          <span className="text-[11px] text-muted-foreground">(editable in a future release)</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Alert threshold</span>
          <span className="text-xs text-muted-foreground">Score drop that triggers an email.</span>
          <input name="alertThreshold" type="number" min={1} defaultValue={domain.alertThreshold} className="mt-1 w-32 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Alert email override</span>
          <span className="text-xs text-muted-foreground">Leave blank to use account default.</span>
          <input name="alertEmail" type="email" defaultValue={domain.alertEmail ?? ""} className="mt-1 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">GSC property</span>
          <span className="text-xs text-muted-foreground">Bind a Search Console property to rank findings by traffic (coming soon).</span>
          <select name="gscIntegrationId" defaultValue="" className="mt-1 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm" disabled>
            <option value="">— none —</option>
            {gscConns.map((c) => <option key={c.id} value={c.id}>GSC ({c.scope ?? c.id.slice(0, 8)})</option>)}
          </select>
        </label>

        <button type="submit" className="inline-flex h-10 w-fit items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save</button>
      </form>

      <section className="flex flex-col gap-3 rounded-[22px] border border-border/60 p-5">
        <header>
          <h2 className="text-sm font-medium">Data source (pSEO data-binding)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload the dataset that drives your pSEO pages. The <code className="font-mono">data/data-binding</code> rule
            verifies each page surfaces its expected records. Format:
            <code className="ml-1 font-mono">[{"{"}"url": "/p/:slug", "data": {"{"}"title": "...", "faqs": [...]{"}"}{"}"}]</code>.
          </p>
        </header>
        {dataSource && (
          <p className="text-xs text-primary">
            ✓ {dataSource.recordCount} records loaded — last updated {new Date(dataSource.updatedAt).toLocaleString()}
          </p>
        )}
        <form action={uploadDataSourceAction} className="flex flex-col gap-3">
          <input type="hidden" name="domainHost" value={domain.host} />
          <textarea
            name="recordsJson"
            rows={6}
            placeholder='[{"url":"/blog/:slug","data":{"title":"…"}}]'
            defaultValue=""
            className="rounded-[10px] border border-border-strong bg-background px-3 py-2 font-mono text-xs"
          />
          <div className="flex items-center gap-2">
            <button type="submit" className="inline-flex h-9 items-center rounded-[14px] bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              {dataSource ? "Replace" : "Upload"}
            </button>
            {dataSource && (
              <form action={removeDataSourceAction} className="inline">
                <input type="hidden" name="domainHost" value={domain.host} />
                <button type="submit" className="inline-flex h-9 items-center rounded-[14px] border border-destructive/50 px-3 text-xs text-destructive hover:bg-destructive/10">
                  Remove
                </button>
              </form>
            )}
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-[22px] border border-border/60 p-5">
        <header>
          <h2 className="text-sm font-medium">Rule thresholds (advanced)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            JSON-override for <code className="font-mono">AuditOptions.rules</code> — e.g.
            <code className="ml-1 font-mono">{"{"}"thinContentMinWords": 150{"}"}</code> to loosen thin-content on short landing pages.
            Leave blank to use defaults.
          </p>
        </header>
        <form action={updateRuleOverridesAction} className="flex flex-col gap-3">
          <input type="hidden" name="domainHost" value={domain.host} />
          <textarea
            name="overridesJson"
            rows={4}
            defaultValue={ruleOverride ? ruleOverride.overrides : ""}
            placeholder='{"thinContentMinWords": 150}'
            className="rounded-[10px] border border-border-strong bg-background px-3 py-2 font-mono text-xs"
          />
          <button type="submit" className="inline-flex h-9 w-fit items-center rounded-[14px] bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            Save overrides
          </button>
        </form>
      </section>
    </div>
  );
}
