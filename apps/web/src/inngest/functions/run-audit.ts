import { and, eq, isNull } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { audits, monitoredDomains, domainDataSources, domainRuleOverrides, userAiKeys, watchedPages } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { uploadSummary, summaryKey } from "@/lib/r2";
import { assertSafeUrl } from "@/lib/ssrf";
import { auditSource, checkOriginHealth, type AuditOptions, type AuditSummary, type StateOptions, type PageDataRecord } from "@pseolint/core";
import { auditLog } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { devFlags } from "@/lib/dev-flags";
import { openSecret } from "@/lib/secret-box";
import {
  resolveAuditIgnorePatterns,
  detectFrameworkFromUrl,
} from "@/lib/audit-defaults";
import { parseScanOptions, type ScanOptions } from "@/lib/scan-options";
import { fetchOgMeta } from "@/lib/og-fetch";
import { hashToInt } from "@/lib/seed";
import { R2CacheBackend } from "@/lib/r2-cache-backend";
import { isLeaderboardEligible, PERMANENT_EXPIRES_AT } from "@/lib/leaderboard";
import { trackServer } from "@/lib/analytics/track.server";

const MAX_COST_USD = 0.50;
/** HTTP cache TTL for entries without ETag/Last-Modified validators (matches the engine default). */
const WEB_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Ops kill-switch for the R2 HTTP cache: set PSEOLINT_R2_CACHE_DISABLED to turn it off without a deploy. */
function r2CacheEnabled(): boolean {
  return !process.env.PSEOLINT_R2_CACHE_DISABLED;
}

type RunStep = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

export type RunAuditInput = {
  auditId: string;
  url: string;
  plan: "free" | "pro";
  sampleSize: number;
  /** Audit mode: "full" runs all rules; "diff" skips corpus-scoped rules. Default: "full". */
  mode?: "full" | "diff";
  /** Run state for diff-mode audits. When provided, only changed/new URLs are audited. */
  state?: StateOptions;
  /** Opt-in Playwright rendered mode (JS-heavy sites). Default: false (static fetch). */
  render?: boolean;
  /**
   * v0.5.3 watched-pages: URLs the engine must always re-fetch this run,
   * regardless of monitoring's diff-mode skip matrix. Forwarded as
   * `auditSource(..., { force })`.
   */
  force?: { urls?: string[] };
};

/**
 * Look up user-scoped AI key, per-domain data source, and per-domain rule overrides
 * for an audit. Each is optional; all are fetched in parallel.
 */
async function loadAuditEnrichments(auditId: string): Promise<{
  aiKey?: { provider: string; model: string | null; apiKey: string };
  dataRecords?: PageDataRecord[];
  ruleOverrides?: NonNullable<AuditOptions["rules"]>;
  gentleAuditMode: boolean;
  authorityScore?: number;
  /** Per-domain render-mode opt-in (Pro). True → render JS-heavy pages in a browser. */
  renderMode?: boolean;
  /**
   * Stable per-domain sampling seed: set ONLY for monitored domains (a
   * `monitoredDomains` row exists for this host), so re-audit / cron diffs
   * sample the same pages each run. Undefined for public one-shot audits.
   */
  sampleSeed?: number;
  /** Canonical host when this is a monitored domain: gates the R2 cache. Undefined for one-shot/anon. */
  monitoredHost?: string;
  /**
   * Validated, allowlisted advanced scan options (Pro per-domain). Only ever
   * the 7 safe AuditOptions knobs: see lib/scan-options.ts. Undefined when
   * unset or invalid. Spread FIRST into the auditSource opts so the fixed
   * safety options (safeMode, respectNoindex, …) always win.
   */
  scanOptions?: ScanOptions;
}> {
  const [audit] = await db
    .select({ userId: audits.userId, sourceUrl: audits.sourceUrl })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);
  if (!audit || !audit.userId) return { gentleAuditMode: false };

  let host: string;
  try { host = new URL(audit.sourceUrl).host; } catch { return { gentleAuditMode: false }; }

  const [domainRow, keyRow] = await Promise.all([
    db.select({
      id: monitoredDomains.id,
      gentleAuditMode: monitoredDomains.gentleAuditMode,
      authorityScore: monitoredDomains.authorityScore,
      renderMode: monitoredDomains.renderMode,
      scanOptions: monitoredDomains.scanOptions,
    })
      .from(monitoredDomains)
      .where(and(
        eq(monitoredDomains.userId, audit.userId),
        eq(monitoredDomains.host, host),
        isNull(monitoredDomains.removedAt),
      ))
      .limit(1),
    db.select({ provider: userAiKeys.provider, model: userAiKeys.model, apiKey: userAiKeys.apiKey })
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, audit.userId))
      .limit(1),
  ]);

  let dataRecords: PageDataRecord[] | undefined;
  let ruleOverrides: NonNullable<AuditOptions["rules"]> | undefined;
  let gentleAuditMode = false;
  let authorityScore: number | undefined;
  let renderMode: boolean | undefined;
  let sampleSeed: number | undefined;
  let monitoredHost: string | undefined;
  let scanOptions: ScanOptions | undefined;
  if (domainRow.length > 0) {
    const domainId = domainRow[0].id;
    monitoredHost = host;
    gentleAuditMode = domainRow[0].gentleAuditMode === true;
    authorityScore = domainRow[0].authorityScore ?? undefined;
    renderMode = domainRow[0].renderMode ?? undefined;
    // Advanced scan options (Pro). Stored as JSON text; re-validated through the
    // allowlist on every load (never trust the column): parseScanOptions
    // returns undefined on invalid/empty so a corrupt row can't widen the
    // audit's powers. This is the validated object that gets spread FIRST in
    // buildAuditCall.
    if (domainRow[0].scanOptions) {
      try {
        scanOptions = parseScanOptions(JSON.parse(domainRow[0].scanOptions)) ?? undefined;
      } catch { /* malformed JSON → no scan options */ }
    }
    // Monitored domain → deterministic per-host sampling so re-audit / cron
    // diffs reflect real content change, not sampling variance.
    sampleSeed = hashToInt(host);
    const [ds, rover] = await Promise.all([
      db.select({ records: domainDataSources.records }).from(domainDataSources).where(eq(domainDataSources.domainId, domainId)).limit(1),
      db.select({ overrides: domainRuleOverrides.overrides }).from(domainRuleOverrides).where(eq(domainRuleOverrides.domainId, domainId)).limit(1),
    ]);
    if (ds[0]) {
      try { dataRecords = JSON.parse(ds[0].records) as PageDataRecord[]; } catch { /* ignore malformed */ }
    }
    if (rover[0]) {
      try { ruleOverrides = JSON.parse(rover[0].overrides) as NonNullable<AuditOptions["rules"]>; } catch { /* ignore */ }
    }
  }

  const aiKey = keyRow[0]
    ? { provider: keyRow[0].provider, model: keyRow[0].model, apiKey: openSecret(keyRow[0].apiKey) }
    : undefined;

  return { aiKey, dataRecords, ruleOverrides, gentleAuditMode, authorityScore, renderMode, sampleSeed, monitoredHost, scanOptions };
}

/**
 * Audit-time origin-degradation thresholds. Default mode mirrors the engine's
 * built-in defaults (5 parallel fetches, no extra sample cap). Gentle mode
 * halves concurrency and caps the sample so a small / un-CDN'd origin doesn't
 * cascade into 5xx territory under our crawl. The engine's BackpressureMonitor
 * still fires if the origin truly degrades, but is much less likely to trip
 * because we're putting less load on it in the first place.
 */
const GENTLE_CONCURRENCY = 2;
const GENTLE_SAMPLE_CAP = 200;
function applyGentleProfile(args: {
  gentle: boolean;
  sampleSize: number;
}): { sampleSize: number; concurrency: number | undefined } {
  if (!args.gentle) return { sampleSize: args.sampleSize, concurrency: undefined };
  return {
    sampleSize: args.sampleSize > 0 ? Math.min(args.sampleSize, GENTLE_SAMPLE_CAP) : GENTLE_SAMPLE_CAP,
    concurrency: GENTLE_CONCURRENCY,
  };
}

export async function executeAudit(input: RunAuditInput, runStep: RunStep) {
  const { auditId, url, plan, sampleSize, mode, state, render, force } = input;
  const startedAt = Date.now();
  const analyticsHost = (() => {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return "unknown"; }
  })();
  const [analyticsOwner] = await db
    .select({ userId: audits.userId, anonSessionId: audits.anonSessionId })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);
  const analyticsProfileId = analyticsOwner?.userId ?? analyticsOwner?.anonSessionId ?? undefined;
  const analyticsAuthed = !!analyticsOwner?.userId;
  auditLog("audit.started", { auditId, plan, sampleSize, mode: mode ?? "full", render: render ?? false });

  await runStep("mark-running", async () => {
    await db.update(audits).set({ status: "running" }).where(eq(audits.id, auditId));
  });

  const { aiKey, dataRecords, ruleOverrides, gentleAuditMode, authorityScore, renderMode, sampleSeed, monitoredHost, scanOptions } = await runStep("load-enrichments", async () =>
    loadAuditEnrichments(auditId),
  );

  // Render is requested when EITHER the per-audit flag (Pro form) is set OR the
  // per-domain render-mode opt-in (Pro settings) is on. It only *activates*
  // below if PSEOLINT_BROWSER_WS is also configured: no endpoint → static
  // fetch, so we never make a false "rendered" promise on a serverless host
  // without a browser service.
  const renderRequested = (input.render || renderMode === true);

  let summary: AuditSummary;
  try {
    await assertSafeUrl(url);
    // AI options: BYO key wins; else managed key for Pro; else disabled.
    const ai: AuditOptions["ai"] | undefined = aiKey
      ? { enabled: true, provider: aiKey.provider, apiKey: aiKey.apiKey, model: aiKey.model ?? undefined, maxCostUsd: MAX_COST_USD }
      : plan === "pro"
        ? { enabled: true, maxCostUsd: MAX_COST_USD }
        : undefined;

    // Pro-gated content-effort signal: the validated recall lever (0-100 originality/effort,
    // moderates the verdict ±1 tier). Sampled (~≤10 pages) + cached in core, ~$0.03/audit.
    // Uses the platform ANTHROPIC_API_KEY env in core; no-ops safely if absent. Free = off.
    const contentEffort: AuditOptions["contentEffort"] | undefined = plan === "pro" ? { enabled: true } : undefined;

    // R2-backed HTTP cache: only for monitored domains (re-audit / cron), where
    // 304-revalidation across runs saves egress + spares the origin. One-shot /
    // anon scans never repeat, so they stay uncached. Fail-safe in the backend;
    // PSEOLINT_R2_CACHE_DISABLED is the ops kill-switch. cacheStats logged on completion.
    const cache: AuditOptions["cache"] | undefined =
      monitoredHost && r2CacheEnabled()
        ? { backend: new R2CacheBackend(monitoredHost), ttlMs: WEB_CACHE_TTL_MS }
        : undefined;

    // Apply per-domain gentle-mode profile if set. Caps concurrency to 2 and
    // sample to 200: easier on small origins and less likely to trip the
    // engine's BackpressureMonitor.
    // Pre-flight origin health (concurrent probe). Every audit path: public
    // one-off scans, dashboard re-audits, and the monitoring cron: runs
    // through here, so this is where we cover the paperforge/Neon scenario (a
    // monitored own-site run whose uncached fan-out degrades the origin). If
    // the origin already looks stressed and we're not already gentle, drop to
    // gentle (low-concurrency) mode so the crawl doesn't finish off a
    // struggling server. Skipped when already gentle (nothing to gain) or when
    // the dev flag is set (don't probe localhost).
    let gentle = gentleAuditMode;
    if (!gentle && !devFlags.preflightDisabled) {
      const health = await runStep("preflight-origin", () =>
        checkOriginHealth(url, { probes: 3, timeoutMs: 4000 }),
      );
      if (health.verdict !== "ok") {
        gentle = true;
        auditLog("audit.preflight.gentle_forced", {
          auditId, verdict: health.verdict, reason: health.reason,
          medianMs: health.medianMs, errorRatio: health.errorRatio,
        });
      }
    }

    const gentleProfile = applyGentleProfile({ gentle, sampleSize });
    const effectiveSampleSize = gentleProfile.sampleSize;
    const effectiveConcurrency = gentleProfile.concurrency;
    if (gentle) {
      auditLog("audit.gentle_mode_applied", {
        auditId,
        sampleSize: effectiveSampleSize,
        concurrency: effectiveConcurrency ?? null,
      });
    }

    // v0.4.2: preflight framework detection so the audit can layer
    // framework-idiomatic ignore patterns on top of WEB_AUDIT_DEFAULT_IGNORE.
    // Capped at 5s; any failure (timeout, network, parse) falls through to
    // base defaults so the audit still runs.
    const detectedFramework = await runStep("detect-framework", async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        const fw = await detectFrameworkFromUrl(url, ctrl.signal);
        // Surface to logs without expanding the AuditLogEvent union; the
        // runStep name "detect-framework" is the primary Inngest signal.
        try {
          console.log(JSON.stringify({
            ts: new Date().toISOString(),
            evt: "audit.framework_detected",
            auditId,
            framework: fw ?? null,
          }));
        } catch { /* never let logging crash the audit */ }
        return fw;
      } finally {
        clearTimeout(timer);
      }
    });

    const buildAuditCall = (opts: { sampleSize: number; concurrency: number | undefined }) => () =>
      auditSource(url, {
        // ┌─────────────────────────── SECURITY INVARIANT ───────────────────────────┐
        // │ `scanOptions` is the Pro-configurable, allowlist-validated subset of      │
        // │ AuditOptions (lib/scan-options.ts: only crawlDiscovery,                  │
        // │ fillBudgetViaLinkDiscovery, samplingStrategy, maxPerTemplate, strict,     │
        // │ pageGroups, entityPatterns). It is spread FIRST, on purpose. Every fixed  │
        // │ safety / policy option below (safeMode:"saas", respectNoindex,            │
        // │ skipDetectedAuth, skipBoilerplate, skipSearchPages, render, cache, ai,    │
        // │ contentEffort, authorityScore, ignore, sampleSeed, mode, state, force)    │
        // │ appears AFTER this spread, so it OVERRIDES anything in scanOptions even    │
        // │ if the allowlist were somehow bypassed. DO NOT move any of those above    │
        // │ this spread, and DO NOT change the spread to come last.                   │
        // └──────────────────────────────────────────────────────────────────────────┘
        ...scanOptions,
        sampleSize: opts.sampleSize,
        // Monitored-domain audits pin a stable per-host seed so repeated runs
        // sample the same pages (deterministic diffs). Undefined for public
        // one-shots: the engine falls back to non-deterministic sampling.
        ...(sampleSeed != null && { sampleSeed }),
        ...(opts.concurrency != null && { concurrency: opts.concurrency }),
        mode,
        state,
        force,
      // 2026-05-03 production fix: hosted audits MUST run with
      // safeMode: "saas" so user-submitted URLs are forced through the
      // SSRF guard, robots.txt is honoured, and per-run caps
      // (maxFetchBytes 10 MB, maxCrawlDiscovered 2000) apply. Without
      // this, a malicious caller could point us at AWS metadata
      // endpoints, RFC1918 networks, or arbitrarily-large tarballs.
      safeMode: "saas",
      // Core's `render` is a config object; undefined = static fetch, any
      // object = rendered. We route it through the operator's Browserless CDP
      // endpoint (PSEOLINT_BROWSER_WS) rather than local Playwright, which
      // doesn't exist on serverless. Fail-safe: render activates ONLY when both
      // requested (Pro per-audit flag or per-domain opt-in) AND the endpoint is
      // configured: no endpoint → static audit, no false "rendered" promise.
      render: (renderRequested && env().PSEOLINT_BROWSER_WS)
        ? { browserWsEndpoint: env().PSEOLINT_BROWSER_WS }
        : undefined,
      rules: ruleOverrides,
      dataSource: dataRecords ? { records: dataRecords } : undefined,
      // Hosted audits run on user-submitted URLs: skip framework metadata,
      // auth, admin, and API routes by default so the report focuses on
      // marketing surface. See lib/audit-defaults.ts for rationale + Pro
      // override path. When the preflight detector identifies a known
      // framework (Next.js, WordPress, Shopify, Webflow, Astro, Nuxt,
      // Remix), additional framework-specific patterns are merged in.
      ignore: resolveAuditIgnorePatterns(detectedFramework),
      // Honour the site owner's `<meta robots noindex>` (true by default in
      // engine; explicit here for clarity) and additionally drop pages
      // heuristically detected as auth surfaces: covers the case where a
      // login page sits at an unconventional URL like `/account` or
      // `/portal` that URL patterns can't pre-declare.
      respectNoindex: true,
      skipDetectedAuth: true,
      // Cookie/legal/imprint + search-result pages aren't marketing surface;
      // skipping them sharpens the findings to what actually ranks. Matches the
      // AuditOptions doc comment for the hosted form.
      skipBoilerplate: true,
      skipSearchPages: true,
      // Per-domain bring-your-own authority (Pro settings). Undefined = no shift.
      authorityScore,
      ai,
      contentEffort,
      cache,
    });

    // First attempt: configured profile (gentle if domain is opted in,
    // otherwise the audit's normal sample/concurrency).
    try {
      summary = await runStep("audit", buildAuditCall({
        sampleSize: effectiveSampleSize,
        concurrency: effectiveConcurrency,
      }));
    } catch (firstErr) {
      // Auto-retry once on origin degradation. Theory: the warmup window
      // primes whatever cache the origin had cold; halving concurrency
      // and sampleSize drops the steady-state load enough that the second
      // pass usually succeeds. We only retry the OriginDegradedError:
      // every other error (SSRF, parse, network) is genuine and rethrown.
      const isDegraded = firstErr instanceof Error && firstErr.name === "OriginDegradedError";
      if (!isDegraded) throw firstErr;

      const retrySample = Math.max(50, Math.floor(effectiveSampleSize > 0 ? effectiveSampleSize / 2 : GENTLE_SAMPLE_CAP / 2));
      const retryConcurrency = Math.max(1, Math.floor((effectiveConcurrency ?? 5) / 2));
      auditLog("audit.degraded.retrying", {
        auditId,
        firstErr: firstErr.message,
        retrySampleSize: retrySample,
        retryConcurrency,
      });
      summary = await runStep("audit-retry", buildAuditCall({
        sampleSize: retrySample,
        concurrency: retryConcurrency,
      }));
      auditLog("audit.degraded.retry_succeeded", { auditId });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "audit failed";
    await db.update(audits).set({
      status: "failed", errorMessage: msg.slice(0, 500), completedAt: new Date(),
    }).where(eq(audits.id, auditId));
    auditLog("audit.failed", { auditId, err: msg, ms: Date.now() - startedAt });
    await trackServer(
      { name: "audit_failed", props: { host: analyticsHost, reason: msg.slice(0, 200) } },
      { profileId: analyticsProfileId },
    );
    return { ok: false as const, error: msg };
  }

  const jsonKey = summaryKey(auditId);
  await runStep("upload-summary", async () => uploadSummary(jsonKey, JSON.stringify(summary)));

  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "unknown";
    }
  })();

  // Pre-fetch OG metadata for public audits to avoid blocking lazy-loading latency on page views.
  // Set to empty string on failure to prevent infinite retries.
  const og = await runStep("fetch-og-meta", async () => {
    const [row] = await db.select({ isPublic: audits.isPublic }).from(audits).where(eq(audits.id, auditId)).limit(1);
    if (row?.isPublic) {
      try {
        const meta = await fetchOgMeta(url);
        return {
          title: meta.title?.slice(0, 200) ?? "",
          description: meta.description?.slice(0, 500) ?? "",
          image: meta.image?.slice(0, 1000) ?? "",
        };
      } catch {
        return { title: "", description: "", image: "" };
      }
    }
    return { title: null, description: null, image: null };
  });

  const completedAt = new Date();
  const findingCount =
    summary.issues.blockers.length +
    summary.issues.shouldFix.length +
    summary.issues.informational.length;

  // Read current visibility so we can decide permanence. Clean public audits:
  // including anonymous ones: get their expiry extended to the far-future
  // sentinel so the listing + /r/[slug] page persist as an SEO corpus entry.
  // Non-eligible audits keep the tier expiry set at creation (anon 1d / free 30d).
  const [vis] = await db
    .select({ isPublic: audits.isPublic })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);
  const eligible = isLeaderboardEligible({
    isPublic: vis?.isPublic ?? false,
    status: "completed",
    host,
    pageCount: summary.pageCount,
    risk: summary.risk,
  });

  // Cache hit-rate telemetry: via console (not the typed auditLog union) so we
  // can measure whether the R2 cache earns its keep, then keep/kill via the
  // switch. Present only on cached (monitored) runs.
  if (summary.cacheStats) {
    try {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        evt: "audit.cache_stats",
        auditId, host,
        hits: summary.cacheStats.hits,
        total: summary.cacheStats.total,
        bytesSavedEstimate: summary.cacheStats.bytesSavedEstimate,
      }));
    } catch { /* never let logging crash the audit */ }
  }

  await runStep("mark-completed", async () => {
    await db.update(audits).set({
      status: "completed",
      risk: summary.risk,
      // Mirror the engine's moderated verdict so the dashboard / portfolio /
      // history surface the moderated signal, not just the raw risk.
      verdict: summary.verdict ?? null,
      pageCount: summary.pageCount,
      findingCount,
      host,
      ogTitle: og.title,
      ogDescription: og.description,
      ogImageUrl: og.image,
      triageRootCauseCount: summary.triage?.rootCauses.length ?? null,
      triageCostUsd: summary.triage?.estimatedCostUsd != null ? String(summary.triage.estimatedCostUsd) : null,
      // Tier 2: the inferred pSEO archetype as a queryable first-class signal
      // (monitoring / cross-domain / fix-budget planner): not just in the summary.
      archetype: summary.triage?.archetype ?? null,
      // v0.4 §4.11: surface site classification on the audit row so the
      // dashboard / report card / portfolio strip can render the badge
      // without round-tripping to R2.
      siteClassification: summary.siteClassification ?? null,
      // v0.5+ change-driven monitoring: mirror the scrapePlan summary onto
      // the row so per-domain dashboards can show "X/Y URLs re-scraped, Z
      // carried forward" without fetching the full R2 blob. Null on fresh
      // and one-shot audits: only monitoring runs produce a scrapePlan.
      scrapePlan: summary.scrapePlan ?? null,
      // The backpressure watchdog can flush a PARTIAL report when the origin
      // degrades mid-crawl. Mirror the flag onto the row so the dashboard can
      // flag/filter degraded audits; the report page reads it straight off R2.
      truncated: summary.truncated ?? false,
      truncatedReason: summary.truncatedReason ?? null,
      storageKey: jsonKey,
      completedAt,
      // Permanence for eligible audits only; omit the key otherwise so the
      // creation-time tier expiry is preserved.
      ...(eligible ? { expiresAt: new Date(PERMANENT_EXPIRES_AT) } : {}),
    }).where(eq(audits.id, auditId));
  });

  // Sync the monitored-domain row so the workspace header / portfolio strip /
  // alert-delta logic see the latest risk, not just the cron-run risk.
  // Without this, `Re-audit now` and the initial add-domain audit silently
  // diverge from `/r/[slug]` (which reads `audits.risk` directly).
  await runStep("sync-monitored-domain", async () => syncMonitoredDomain(auditId, summary.risk, summary.verdict ?? null, completedAt));

  // v0.5.3: stamp lastAuditedAt on watched pages that were force-refetched
  // this run. Scoped to *this audit's* monitored_domain so we don't update
  // another tenant's watched_pages row when two users happen to watch the
  // same URL (common case: `https://example.com/`). Best-effort: the audit
  // itself already succeeded; failure here just leaves stale timestamps
  // until the next run.
  if (force?.urls && force.urls.length > 0) {
    await runStep("stamp-watched-pages", async () => {
      try {
        const [auditRow] = await db
          .select({ userId: audits.userId, sourceUrl: audits.sourceUrl })
          .from(audits)
          .where(eq(audits.id, auditId))
          .limit(1);
        if (!auditRow?.userId) return;
        let host: string;
        try { host = new URL(auditRow.sourceUrl).host; } catch { return; }
        const [domRow] = await db
          .select({ id: monitoredDomains.id })
          .from(monitoredDomains)
          .where(and(
            eq(monitoredDomains.userId, auditRow.userId),
            eq(monitoredDomains.host, host),
            isNull(monitoredDomains.removedAt),
          ))
          .limit(1);
        if (!domRow) return;
        await db.update(watchedPages)
          .set({ lastAuditedAt: completedAt })
          .where(and(
            eq(watchedPages.monitoredDomainId, domRow.id),
            inArray(watchedPages.url, force.urls!),
          ));
      } catch {
        /* non-fatal */
      }
    });
  }

  auditLog("audit.completed", {
    auditId,
    risk: summary.risk,
    pageCount: summary.pageCount,
    findingCount,
    ms: Date.now() - startedAt,
  });
  await trackServer(
    {
      name: "audit_completed",
      props: {
        host: analyticsHost,
        score: summary.risk,
        pageCount: summary.pageCount,
        findingCount,
        durationMs: Date.now() - startedAt,
        classification: summary.siteClassification?.type ?? null,
        truncated: summary.truncated ?? false,
        authed: analyticsAuthed,
      },
    },
    { profileId: analyticsProfileId },
  );
  return { ok: true as const, risk: summary.risk };
}

async function syncMonitoredDomain(auditId: string, risk: number, verdict: AuditSummary["verdict"] | null, completedAt: Date): Promise<void> {
  const [audit] = await db
    .select({ userId: audits.userId, sourceUrl: audits.sourceUrl })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);
  if (!audit?.userId) return;
  let host: string;
  try { host = new URL(audit.sourceUrl).host; } catch { return; }
  await db.update(monitoredDomains)
    .set({ lastRisk: risk, lastVerdict: verdict, lastAuditId: auditId, lastRunAt: completedAt })
    .where(and(
      eq(monitoredDomains.userId, audit.userId),
      eq(monitoredDomains.host, host),
      isNull(monitoredDomains.removedAt),
    ));
}

/** Run the audit in-process without Inngest. Used by the monitor cron and by dev flows when workers aren't available. */
export async function executeAuditInProcess(input: RunAuditInput) {
  return executeAudit(input, (_name, fn) => fn());
}

export const runAudit = inngest.createFunction(
  {
    id: "run-audit",
    retries: 1,
    // Function-wide concurrency cap. Prevents a single viral moment (e.g. HN front
    // page hit on `/`) from spawning unbounded parallel crawls. Per-host cap in
    // /api/audits gates target-side burst; this gates worker-pool burst.
    concurrency: { limit: 20 },
  },
  { event: "audit/requested" },
  async ({ event, step }) => executeAudit(
    event.data,
    (name, fn) => step.run(name, fn) as unknown as ReturnType<typeof fn>,
  ),
);
