import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, integrations, domainDataSources, domainRuleOverrides } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { listSites, type GscSite } from "@/lib/gsc";
import {
  updateDomainSettingsAction,
  removeDataSourceAction,
  updateRuleOverridesAction,
  updateSlackWebhookAction,
  testSlackWebhookAction,
} from "./actions";
import { DataSourceForm } from "./data-source-form";

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

  const [gscConn] = await db.select({ id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc")))
    .limit(1);
  const gscConnected = Boolean(gscConn);

  // If GSC is connected, fetch the user's verified properties live so the
  // dropdown shows actual GSC sites (not stored IDs). Cheap call (~1 API hit).
  // On failure (revoked perms, network), fall back to "connection broken" UI.
  let gscSites: GscSite[] = [];
  let gscError: string | null = null;
  if (gscConnected) {
    try {
      gscSites = await listSites(session.user.id);
    } catch (e) {
      gscError = e instanceof Error ? e.message : "GSC API call failed";
    }
  }

  const [dataSource] = await db.select().from(domainDataSources).where(eq(domainDataSources.domainId, domain.id)).limit(1);
  const [ruleOverride] = await db.select().from(domainRuleOverrides).where(eq(domainRuleOverrides.domainId, domain.id)).limit(1);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">Portfolio</Link>
        <span>/</span>
        <Link href={`/dashboard/${encodeURIComponent(domain.host)}`} className="hover:text-foreground">{domain.host}</Link>
        <span>/</span>
        <span className="text-foreground">Settings</span>
      </nav>
      <h1 className="text-xl font-medium">Settings — {domain.host}</h1>

      <form action={updateDomainSettingsAction} className="flex flex-col gap-5 rounded-[18px] border border-border/60 p-5">
        <input type="hidden" name="domainHost" value={domain.host} />

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Cadence</span>
          <span className="text-xs text-muted-foreground">
            Daily diff-audit at 04:00 UTC · weekly full re-audit on Sunday.
          </span>
        </div>

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
          <span className="text-xs text-muted-foreground">Bind a Search Console property to weight findings by traffic-at-risk.</span>
          {!gscConnected ? (
            <p className="mt-1 text-xs">
              <Link href="/dashboard/integrations" className="text-primary hover:underline">Connect Search Console</Link>
              {" "}first to bind a property.
            </p>
          ) : gscError ? (
            <p className="mt-1 text-xs text-destructive">
              Couldn&apos;t reach Google: {gscError}. <Link href="/dashboard/integrations" className="text-primary hover:underline">Re-connect</Link>?
            </p>
          ) : (
            <select name="gscSiteUrl" defaultValue={domain.gscSiteUrl ?? ""}
                    className="mt-1 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm">
              <option value="">— unbound —</option>
              {gscSites.map((s) => (
                <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>
              ))}
            </select>
          )}
          {gscConnected && !gscError && gscSites.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              No verified properties found in this Google account.
            </p>
          )}
        </label>

        <button type="submit" className="inline-flex h-10 w-fit items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save</button>
      </form>

      <section className="flex flex-col gap-3 rounded-[18px] border border-border/60 p-5">
        <header>
          <h2 className="text-sm font-medium">Slack notifications</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            POST every alert to a Slack channel via incoming webhook. Create one at{" "}
            <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
              api.slack.com/messaging/webhooks
            </a>{" "}
            and paste it below. Cleared when you save an empty value.
          </p>
        </header>
        <form action={updateSlackWebhookAction} className="flex flex-col gap-3">
          <input type="hidden" name="domainHost" value={domain.host} />
          <input
            name="slackWebhookUrl"
            type="url"
            placeholder="https://hooks.slack.com/services/T…/B…/…"
            defaultValue={domain.slackWebhookUrl ?? ""}
            className="rounded-[10px] border border-border-strong bg-background px-3 py-2 font-mono text-xs"
          />
          <div className="flex items-center gap-2">
            <button type="submit" className="inline-flex h-9 items-center rounded-[14px] bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              Save
            </button>
          </div>
        </form>
        {domain.slackWebhookUrl && (
          <form action={testSlackWebhookAction} className="flex items-center gap-2">
            <input type="hidden" name="domainHost" value={domain.host} />
            <button type="submit" className="inline-flex h-9 items-center rounded-[14px] border border-border-strong px-3 text-xs hover:bg-card">
              Send test message
            </button>
            <span className="font-mono text-[11px] text-success">
              ● Webhook configured
            </span>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[18px] border border-border/60 p-5">
        <header>
          <h2 className="text-sm font-medium">Data source (pSEO data-binding)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload the dataset that drives your pSEO pages. The <code className="font-mono">data/data-binding</code> rule
            verifies each page surfaces its expected records.
          </p>
        </header>
        {dataSource && (
          <p className="text-xs text-primary">
            ✓ {dataSource.recordCount} records loaded — last updated {new Date(dataSource.updatedAt).toLocaleString()}
          </p>
        )}
        <DataSourceForm host={domain.host} hasExisting={Boolean(dataSource)} />
        {dataSource && (
          <form action={removeDataSourceAction} className="inline">
            <input type="hidden" name="domainHost" value={domain.host} />
            <button type="submit" className="inline-flex h-9 w-fit items-center rounded-[14px] border border-destructive/50 px-3 text-xs text-destructive hover:bg-destructive/10">
              Remove current dataset
            </button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[18px] border border-border/60 p-5">
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
