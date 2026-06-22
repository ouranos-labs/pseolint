import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, integrations, domainDataSources, domainRuleOverrides } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { listSites, pickBestGscProperty, type GscSite } from "@/lib/gsc";
import {
  updateDomainSettingsAction,
  removeDataSourceAction,
  updateRuleOverridesAction,
  updateScanOptionsAction,
  updateSlackWebhookAction,
  testSlackWebhookAction,
  rebindGscPropertyAction,
} from "./actions";
import { parseScanOptions } from "@/lib/scan-options";
import { DataSourceForm } from "./data-source-form";
import { IndexNowDomainForm } from "@/components/dashboard/indexnow-domain-form";

type GscSavedState = "bound" | "rebound" | "unbound" | "unchanged" | "no_grant" | "no_match" | "failed";

export default async function DomainSettings({
  params,
  searchParams,
}: {
  params: Promise<{ host: string }>;
  searchParams: Promise<{ saved?: string; gsc?: string; siteUrl?: string }>;
}) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  if ((await getPlan(session.user.id)) !== "pro") redirect("/pricing");

  const { host: rawHost } = await params;
  const host = decodeURIComponent(rawHost);
  const sp = await searchParams;
  const saved = sp.saved === "1";
  const gscState = (sp.gsc ?? null) as GscSavedState | null;
  const gscBoundSiteUrl = sp.siteUrl ?? null;
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

  // Pre-fill the advanced scan-options controls from the stored (already
  // allowlist-validated) JSON. Re-parse defensively so a corrupt column just
  // renders empty controls rather than crashing the page. pageGroups /
  // entityPatterns go back into their JSON textareas; the simple knobs map to
  // checkboxes / select / number inputs.
  const scanOpts = (() => {
    if (!domain.scanOptions) return null;
    try { return parseScanOptions(JSON.parse(domain.scanOptions)); }
    catch { return null; }
  })();

  // Suggested GSC match: when the domain is unbound but there is exactly
  // one high-confidence GSC property for this host, surface it as a
  // "Auto-bind" affordance + pre-select it in the dropdown so saving the
  // form is a one-click bind. pickBestGscProperty returns null on tie or
  // no match, so this is silent when ambiguous (the user picks manually).
  const gscSuggestion =
    gscConnected && !gscError && !domain.gscSiteUrl
      ? pickBestGscProperty(gscSites, domain.host)
      : null;

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

      <SaveFeedback saved={saved} gsc={gscState} siteUrl={gscBoundSiteUrl} />

      <form action={updateDomainSettingsAction} className="flex flex-col gap-5 rounded-[18px] border border-border/60 p-5">
        <input type="hidden" name="domainHost" value={domain.host} />

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Cadence</span>
          <span className="text-xs text-muted-foreground">
            Diff-audit roughly every 24h · full re-audit every 7 days.
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
          <span className="text-sm font-medium">Domain authority (optional)</span>
          <span className="text-xs text-muted-foreground">
            Your domain&apos;s authority/reputation, 0–100 (e.g. Moz DA, Ahrefs DR).
            High authority (≥80) relaxes the verdict one tier; low (≤30) tightens it
            one tier — counters false positives on thin-but-trusted pages. The raw
            risk score is never changed. Leave blank to skip.
          </span>
          <input name="authorityScore" type="number" min={0} max={100} defaultValue={domain.authorityScore ?? ""} className="mt-1 w-32 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm" />
        </label>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name="gentleAuditMode"
            defaultChecked={domain.gentleAuditMode === true}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-primary"
          />
          <span className="flex flex-col gap-1">
            <span className="text-sm font-medium">Gentle audit mode</span>
            <span className="text-xs text-muted-foreground">
              Cap audits to 2 parallel fetches and 200 pages. Use when audits
              keep tripping the &quot;origin looks degraded&quot; safety guard
              (small / un-CDN&apos;d origins, sites that throttle aggressive
              crawlers). Trades thoroughness for politeness.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name="renderMode"
            defaultChecked={domain.renderMode === true}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-primary"
          />
          <span className="flex flex-col gap-1">
            <span className="text-sm font-medium">Render JS-heavy pages (browser)</span>
            <span className="text-xs text-muted-foreground">
              Render pages in a headless browser before auditing — needed for
              JS-heavy / SPA sites (Webflow, Framer, client-rendered Next).
              Slower + heavier; uses the configured browser service.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="gscSiteUrl" className="text-sm font-medium">GSC property</label>
            {domain.gscSiteUrl ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-success">
                <span className="inline-block h-1 w-1 rounded-full bg-success" />
                Bound
              </span>
            ) : gscSuggestion ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                Match suggested
              </span>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">
            Bind a Search Console property to weight findings by traffic-at-risk.
          </span>
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
            <>
              <select
                id="gscSiteUrl"
                name="gscSiteUrl"
                defaultValue={domain.gscSiteUrl ?? gscSuggestion ?? ""}
                className="mt-1 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm"
              >
                <option value="">— unbound —</option>
                {gscSites.map((s) => (
                  <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>
                ))}
              </select>
              {gscSuggestion && !domain.gscSiteUrl && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Suggested: <code className="font-mono text-foreground">{gscSuggestion}</code>{" "}
                  · save the form to bind, or pick a different property above.
                </p>
              )}
            </>
          )}
          {gscConnected && !gscError && gscSites.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              No verified properties found in this Google account.
            </p>
          )}
        </div>

        <button type="submit" className="inline-flex h-10 w-fit items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save</button>
      </form>

      {/* Standalone "auto-bind" entry point for the case where GSC was
          connected AFTER this domain was added (so the OAuth-callback
          autobind pass already ran without seeing this row). Hidden when
          there's nothing to do. */}
      {gscConnected && !gscError && gscSites.length > 0 && (
        <form
          action={rebindGscPropertyAction}
          className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border/60 bg-card/40 px-4 py-3"
        >
          <input type="hidden" name="domainHost" value={domain.host} />
          <p className="text-xs text-muted-foreground">
            {domain.gscSiteUrl
              ? "Re-detect the matching property from your Search Console properties."
              : gscSuggestion
              ? "We found a matching property — bind it in one click."
              : "Try matching this host against your Search Console properties."}
          </p>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-[12px] border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/15"
          >
            Auto-bind matching property
          </button>
        </form>
      )}

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
            Upload the dataset that drives your pSEO pages. The <code className="font-mono">data/missing-binding</code> and <code className="font-mono">data/identical-across-pages</code> rules
            verify each page surfaces its expected records.
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
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">IndexNow Protocol</h2>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {domain.indexNowKey ? "connected" : "disconnected"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Instantly notify Bing, Yandex, Seznam, and other search engines about page changes in real-time.
          </p>
        </header>
        <IndexNowDomainForm domainHost={domain.host} initialKey={domain.indexNowKey ?? ""} />
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

      <section className="flex flex-col gap-3 rounded-[18px] border border-border/60 p-5">
        <header>
          <h2 className="text-sm font-medium">Advanced scan options</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Fine-tune how the engine discovers, samples, and groups your pages.
            These map to the safe subset of <code className="font-mono">AuditOptions</code>;
            safety settings (SSRF guard, robots, noindex, byte caps) are always
            enforced and can&apos;t be changed here. Leave everything default to
            use the standard crawl.
          </p>
        </header>
        <form action={updateScanOptionsAction} className="flex flex-col gap-5">
          <input type="hidden" name="domainHost" value={domain.host} />

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              name="crawlDiscovery"
              defaultChecked={scanOpts?.crawlDiscovery === true}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-primary"
            />
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">Crawl link discovery</span>
              <span className="text-xs text-muted-foreground">
                Follow same-origin links to find pages beyond the sitemap.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              name="fillBudgetViaLinkDiscovery"
              defaultChecked={scanOpts?.fillBudgetViaLinkDiscovery === true}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-primary"
            />
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">Top up sample via link discovery</span>
              <span className="text-xs text-muted-foreground">
                When the sitemap yields fewer pages than the sample budget,
                follow links (one level deep) to fill it. Requires crawl link
                discovery.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              name="strict"
              defaultChecked={scanOpts?.strict === true}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-primary"
            />
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">Strict (run every rule)</span>
              <span className="text-xs text-muted-foreground">
                Keep site classification but run all rules regardless of detected
                site type — no pSEO-only rules are suppressed.
              </span>
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Sampling strategy</span>
            <span className="text-xs text-muted-foreground">
              How pages are picked when the sample is smaller than the site.
              Stratified spreads the sample across URL templates; random is a
              flat draw.
            </span>
            <select
              name="samplingStrategy"
              defaultValue={scanOpts?.samplingStrategy ?? ""}
              className="mt-1 w-48 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm"
            >
              <option value="">Default (stratified)</option>
              <option value="stratified">Stratified</option>
              <option value="random">Random</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Max samples per template</span>
            <span className="text-xs text-muted-foreground">
              Cap how many pages each detected URL-template cluster contributes.
              Leave blank for no per-template cap.
            </span>
            <input
              name="maxPerTemplate"
              type="number"
              min={1}
              defaultValue={scanOpts?.maxPerTemplate ?? ""}
              className="mt-1 w-32 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Page groups (advanced)</span>
            <span className="text-xs text-muted-foreground">
              JSON map of named groups → <code className="font-mono">{"{ match, rules?, overrides? }"}</code>.
              <code className="ml-1 font-mono">match</code> is a glob (or array of globs) over the URL path;
              <code className="ml-1 font-mono">rules</code> limits which rules run for the group;
              <code className="ml-1 font-mono">overrides</code> sets per-rule thresholds. Leave blank to skip.
            </span>
            <textarea
              name="pageGroupsJson"
              rows={4}
              defaultValue={scanOpts?.pageGroups ? JSON.stringify(scanOpts.pageGroups, null, 2) : ""}
              placeholder={'{\n  "landing": { "match": "/lp/*", "rules": ["meta/title-too-long"] }\n}'}
              className="rounded-[10px] border border-border-strong bg-background px-3 py-2 font-mono text-xs"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Entity patterns (advanced)</span>
            <span className="text-xs text-muted-foreground">
              Custom entity-mask patterns merged with the defaults (US states, ZIP codes).
              JSON array of <code className="font-mono">{"{ placeholder, pattern, flags? }"}</code> — used to
              normalize templated tokens (e.g. city / SKU) when comparing pages for near-duplication.
              Leave blank to skip.
            </span>
            <textarea
              name="entityPatternsJson"
              rows={4}
              defaultValue={scanOpts?.entityPatterns ? JSON.stringify(scanOpts.entityPatterns, null, 2) : ""}
              placeholder={'[\n  { "placeholder": "CITY", "pattern": "[A-Z][a-z]+", "flags": "g" }\n]'}
              className="rounded-[10px] border border-border-strong bg-background px-3 py-2 font-mono text-xs"
            />
          </label>

          <button type="submit" className="inline-flex h-9 w-fit items-center rounded-[14px] bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            Save scan options
          </button>
        </form>
      </section>
    </div>
  );
}

/**
 * Transient banner that confirms what the previous server-action submit
 * actually changed. Reads its state from the redirect query string so a
 * page reload (without the params) silently dismisses it — same affordance
 * as the GSC OAuth callback's `?gsc=connected&bound=…` banner.
 */
function SaveFeedback({
  saved,
  gsc,
  siteUrl,
}: {
  saved: boolean;
  gsc: GscSavedState | null;
  siteUrl: string | null;
}) {
  if (!saved && !gsc) return null;

  // Error / warning paths — these come from rebindGscPropertyAction and
  // never carry saved=1 (the operation didn't change anything).
  if (gsc === "no_grant") {
    return (
      <Banner tone="warning">
        Search Console isn&apos;t connected yet —{" "}
        <Link href="/dashboard/integrations" className="font-medium underline-offset-2 hover:underline">
          connect it
        </Link>{" "}
        first, then re-run auto-bind.
      </Banner>
    );
  }
  if (gsc === "no_match") {
    return (
      <Banner tone="warning">
        No verified Search Console property matches this host. Pick one
        manually from the dropdown above, or re-verify the property in
        Google Search Console.
      </Banner>
    );
  }
  if (gsc === "failed") {
    return (
      <Banner tone="destructive">
        Couldn&apos;t reach Google to look up your properties. The grant may
        have been revoked —{" "}
        <Link href="/dashboard/integrations" className="font-medium underline-offset-2 hover:underline">
          re-connect Search Console
        </Link>
        .
      </Banner>
    );
  }

  // Success paths — saved=1.
  if (gsc === "bound" && siteUrl) {
    return (
      <Banner tone="success">
        Settings saved · bound to <code className="font-mono text-xs">{siteUrl}</code>.
        Findings will rank by traffic-at-risk on the next sync (~24h).
      </Banner>
    );
  }
  if (gsc === "rebound" && siteUrl) {
    return (
      <Banner tone="success">
        Settings saved · re-bound to <code className="font-mono text-xs">{siteUrl}</code>.
      </Banner>
    );
  }
  if (gsc === "unbound") {
    return (
      <Banner tone="muted">
        Settings saved · GSC property unbound. Findings rank by severity ×
        pages until you bind a property again.
      </Banner>
    );
  }
  if (gsc === "unchanged" && saved) {
    return <Banner tone="success">Settings saved.</Banner>;
  }
  return null;
}

function Banner({
  tone,
  children,
}: {
  tone: "success" | "warning" | "destructive" | "muted";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-success/30 bg-success/5 text-success"
      : tone === "warning"
      ? "border-warning/40 bg-warning/5 text-warning"
      : tone === "destructive"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : "border-border/60 bg-card/40 text-muted-foreground";
  return (
    <div className={`rounded-[14px] border px-4 py-3 text-sm ${cls}`}>{children}</div>
  );
}
