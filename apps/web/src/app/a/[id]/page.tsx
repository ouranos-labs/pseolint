"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ScanningTiles } from "@/components/audit/scanning-tiles";
import { CopyLinkButton } from "@/components/audit/copy-link-button";
import { describeAuditFailure, type AuditFailureCode } from "@/lib/audit-failure";
import { signInHref } from "@/lib/audit-errors";
import {
  classifyPollStatus,
  elapsedSince,
  formatElapsed,
  nextPollDelay,
  progressPhase,
} from "@/lib/audit-progress";

// Only allow same-origin relative paths to prevent open-redirect via ?next=.
function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

type AuditStatus = "queued" | "running" | "completed" | "failed" | string;

type AuditPoll = {
  status: AuditStatus;
  slug?: string;
  sourceUrl?: string;
  createdAt?: string;
  pageCap?: number | null;
  viewer?: "anon" | "user";
  errorMessage?: string | null;
  failureCode?: AuditFailureCode | null;
  slotRefunded?: boolean | null;
};

/**
 * Exactly one of these is ever on screen, so "failed" and "running" (or
 * "not found" and a live progress grid) can never be shown together.
 */
type View =
  | { kind: "loading" }
  | { kind: "gone" }
  | { kind: "in_flight"; audit: AuditPoll }
  | { kind: "failed"; audit: AuditPoll };

const STEPS: { key: AuditStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "running", label: "Crawling + scoring" },
  { key: "completed", label: "Report ready" },
];

const PRIMARY_BTN =
  "inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90";
const SECONDARY_BTN =
  "inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [view, setView] = useState<View>({ kind: "loading" });
  const [connectionLost, setConnectionLost] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pageUrl, setPageUrl] = useState(`/a/${id}`);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = safeNext(searchParams.get("next"));

  useEffect(() => {
    setPageUrl(`${window.location.origin}/a/${id}`);
    const clockId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clockId);
  }, [id]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const schedule = (): void => {
      if (!stopped) timer = setTimeout(tick, nextPollDelay(failures));
    };

    const tick = async (): Promise<void> => {
      let res: Response;
      try {
        res = await fetch(`/api/audits/${id}`, { cache: "no-store" });
      } catch {
        // Transport error: the audit is not failed, we just can't see it.
        failures += 1;
        setConnectionLost(true);
        schedule();
        return;
      }
      const outcome = classifyPollStatus(res.status);
      if (outcome === "gone") {
        setConnectionLost(false);
        setView({ kind: "gone" });
        return; // stop polling
      }
      if (outcome === "transient") {
        failures += 1;
        setConnectionLost(true);
        schedule();
        return;
      }
      let json: AuditPoll;
      try {
        json = (await res.json()) as AuditPoll;
      } catch {
        failures += 1;
        setConnectionLost(true);
        schedule();
        return;
      }
      failures = 0;
      setConnectionLost(false);
      if (json.status === "completed") {
        router.replace(nextParam ?? `/r/${json.slug ?? id}`);
        return;
      }
      if (json.status === "failed") {
        setView({ kind: "failed", audit: json });
        return;
      }
      if (json.status === "expired") {
        setView({ kind: "gone" });
        return;
      }
      setView({ kind: "in_flight", audit: json });
      schedule();
    };

    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, router, nextParam]);

  if (view.kind === "gone") return <AuditNotFound />;

  const audit = view.kind === "loading" ? null : view.audit;
  const host = hostOf(audit?.sourceUrl ?? null);
  const failed = view.kind === "failed";
  const isDegraded = failed && audit?.failureCode === "origin_degraded";
  const elapsed = elapsedSince(audit?.createdAt, now);
  const phase = view.kind === "in_flight" && elapsed != null ? progressPhase(elapsed) : "normal";
  const status = audit?.status ?? "queued";
  const activeIndex = STEPS.findIndex((s) => s.key === status);
  const retryHref = audit?.sourceUrl ? `/?prefill=${encodeURIComponent(audit.sourceUrl)}` : "/";

  const headerLabel =
    view.kind === "loading"
      ? "Loading audit"
      : failed
        ? isDegraded ? "Audit stopped early" : "Audit failed"
        : phase === "stuck" ? "Audit seems stuck" : "Running audit";
  const headerDot =
    view.kind === "loading"
      ? "bg-muted-foreground"
      : failed
        ? isDegraded ? "bg-warning" : "bg-destructive"
        : phase === "stuck" ? "bg-warning" : "animate-pulse bg-primary";

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${headerDot}`} />
        {headerLabel}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
        <h1
          className="min-w-0 text-balance break-words text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          {host ?? "Loading…"}
        </h1>
        <span className="font-mono text-xs text-muted-foreground">audit · {id.slice(0, 8)}</span>
      </div>

      {view.kind === "in_flight" && (
        <>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            {audit?.pageCap
              ? `Crawling up to ${audit.pageCap} pages, `
              : "Crawling a sample of your pages, "}
            classifying templates and scoring them against the SpamBrain + AEO rule set. Usually 30 to 120 seconds.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>You can close this tab. Copy this link to come back.</span>
            <CopyLinkButton url={pageUrl} label="Copy link" className="h-8 rounded-[12px] px-3 text-xs" />
          </div>
        </>
      )}

      {connectionLost && view.kind !== "failed" && (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
          Connection lost, retrying…
        </p>
      )}

      <div className="mt-8 overflow-hidden rounded-[28px] border border-border/70 bg-card/60 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-3.5 text-xs">
          <span className="font-mono text-muted-foreground">{host ?? " "}</span>
          {view.kind === "in_flight" && elapsed != null && (
            <span className="font-mono tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
          )}
        </div>

        {view.kind === "in_flight" && phase !== "stuck" && (
          <div className="px-6 pb-4 pt-6">
            <ScanningTiles title="Live scan preview: decorative" />
          </div>
        )}

        {view.kind !== "loading" && (
          <ul className="flex flex-col gap-3 border-t border-border/60 px-6 py-5">
            {STEPS.map((s, i) => {
              // A failed run always got past the queue and stopped while crawling.
              const done = failed ? i < 1 : activeIndex > i;
              const active = !failed && phase !== "stuck" && !done && (activeIndex === i || (activeIndex === -1 && i === 0));
              const stepFailed = failed && i === 1;
              return (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  <StatusGlyph
                    state={stepFailed ? (isDegraded ? "stopped" : "failed") : done ? "done" : active ? "active" : "idle"}
                  />
                  <span className={done || active ? "text-foreground" : "text-muted-foreground/60"}>{s.label}</span>
                  {active && (
                    <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-primary">
                      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                      live
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {view.kind === "in_flight" && phase === "slow" && (
          <p className="mx-6 mb-6 rounded-[14px] border border-border/70 bg-background/40 p-3 text-xs text-muted-foreground">
            Taking longer than usual. Large sitemaps or slow sites can take a few minutes. Your link stays valid.
          </p>
        )}
        {view.kind === "in_flight" && phase === "stuck" && (
          <div className="mx-6 mb-6 flex flex-wrap items-center gap-3 rounded-[14px] border border-warning/40 bg-warning/5 p-4 text-sm">
            <p className="flex-1 text-foreground">This audit seems stuck.</p>
            <Link href={retryHref} className={PRIMARY_BTN}>Start over</Link>
          </div>
        )}

        {view.kind === "failed" && audit && (
          isDegraded
            ? <DegradedBlock audit={audit} retryHref={retryHref} />
            : <FailureBlock audit={audit} host={host} retryHref={retryHref} />
        )}
      </div>
    </main>
  );
}

/** Same voice as app/not-found.tsx: what happened, how long reports live, one way forward. */
function AuditNotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-6 px-5 py-16 text-center">
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
        404 · audit not found
      </div>
      <h1
        className="text-balance text-4xl tracking-tight sm:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        This audit doesn&apos;t exist or has expired.
      </h1>
      <p className="max-w-md text-base leading-relaxed text-muted-foreground">
        Anonymous reports are kept 24 hours.
      </p>
      <Link
        href="/"
        className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Run a new audit
      </Link>
    </main>
  );
}

/**
 * The "try again" action for a failed run. A failed run normally refunds the
 * caller's rate-limit slots (run-audit.ts). When it could not (the stuck-row
 * sweeper), an anonymous caller's retry would be refused by the per-site cap,
 * so offer the path that actually works.
 */
function RetryAction({ audit, retryHref }: { audit: AuditPoll; retryHref: string }) {
  if (audit.viewer === "anon" && audit.slotRefunded === false) {
    return <Link href={signInHref(retryHref)} className={PRIMARY_BTN}>Sign in (free) to retry now</Link>;
  }
  return <Link href={retryHref} className={PRIMARY_BTN}>Try again</Link>;
}

function TechnicalDetails({ raw }: { raw: string | null | undefined }) {
  if (!raw) return null;
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">Technical details</summary>
      <p className="mt-1.5 max-w-2xl break-words font-mono text-[11px] text-muted-foreground/80">{raw}</p>
    </details>
  );
}

function FailureBlock({ audit, host, retryHref }: { audit: AuditPoll; host: string | null; retryHref: string }) {
  const { cause, action } = describeAuditFailure(audit.failureCode ?? "unknown", host);
  return (
    <div className="m-6 mt-0 flex flex-col gap-4 rounded-[18px] border border-destructive/40 bg-destructive/5 p-5 text-sm">
      <div>
        <p className="text-foreground">{cause}</p>
        <p className="mt-1 text-muted-foreground">{action}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <RetryAction audit={audit} retryHref={retryHref} />
        <Link href="/" className={SECONDARY_BTN}>Back to home</Link>
      </div>
      <TechnicalDetails raw={audit.errorMessage} />
    </div>
  );
}

/**
 * The backpressure watchdog stopped the crawl because the origin slowed down
 * under it. Structured explanation plus concrete next steps; the engine's own
 * numbers are shown when it produced them.
 */
function DegradedBlock({ audit, retryHref }: { audit: AuditPoll; retryHref: string }) {
  const diag = parseDegradationDiagnostics(audit.errorMessage ?? "");
  const settingsHref =
    audit.viewer === "user" && audit.sourceUrl
      ? (() => {
          try {
            return `/dashboard/${encodeURIComponent(new URL(audit.sourceUrl).host)}/settings`;
          } catch {
            return null;
          }
        })()
      : null;

  return (
    <div className="m-6 mt-0 flex flex-col gap-4 rounded-[18px] border border-warning/40 bg-warning/5 p-5 text-sm">
      <div>
        <p className="font-medium text-foreground">We stopped early to protect your server.</p>
        <p className="mt-1.5 text-muted-foreground">
          Your origin slowed down sharply while we were crawling, which usually means the cache went cold or the
          site started rate-limiting us.
        </p>
      </div>
      {diag && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-[12px] border border-warning/25 bg-background/40 px-3 py-2.5 text-xs sm:grid-cols-4">
          <Diag label="Baseline p95" value={`${diag.baseline}ms`} />
          <Diag label="Rolling p95" value={`${diag.p95}ms`} warn />
          <Diag label="5xx rate" value={`${diag.errorPct}%`} />
          <Diag label="Fetches" value={diag.fetches} />
        </dl>
      )}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">What to do next</p>
        <ul className="mt-1.5 flex flex-col gap-1.5 text-xs text-foreground/90">
          <Step title="Warm the cache.">Visit a few pages once so your CDN or origin caches them, then run the audit again.</Step>
          {settingsHref && (
            <Step title="Enable Gentle audit mode.">
              Caps audits to 2 parallel fetches and 200 pages so a small origin isn&apos;t overwhelmed. Toggle it in domain settings.
            </Step>
          )}
          <Step title="Check rate-limiting.">
            If your origin throttles repeated requests from one IP, allow-list
            <code className="mx-1 font-mono text-[11px]">user-agent: pseolint</code>
            or audit again later when traffic is quieter.
          </Step>
        </ul>
      </div>
      <div className="flex flex-wrap gap-3 pt-1">
        <RetryAction audit={audit} retryHref={retryHref} />
        {settingsHref && (
          <Link href={settingsHref} className={SECONDARY_BTN}>
            Domain settings →
          </Link>
        )}
      </div>
      <TechnicalDetails raw={audit.errorMessage} />
    </div>
  );
}

function Diag({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-mono tabular-nums ${warn ? "text-warning" : "text-foreground"}`}>{value}</dd>
    </div>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-[3px] inline-block h-1 w-1 shrink-0 rounded-full bg-warning/70" />
      <span>
        <span className="font-medium">{title}</span> {children}
      </span>
    </li>
  );
}

function parseDegradationDiagnostics(err: string): {
  p95: string;
  baseline: string;
  errorPct: string;
  fetches: string;
} | null {
  const m = err.match(/p95=(\d+)ms,\s*baseline=(\d+)ms,\s*5xx=(\d+)%,\s*fetches=(\d+)/);
  if (!m) return null;
  return { p95: m[1], baseline: m[2], errorPct: m[3], fetches: m[4] };
}

function StatusGlyph({ state }: { state: "done" | "active" | "idle" | "failed" | "stopped" }) {
  if (state === "done") {
    return (
      <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-success/50 bg-success/10 text-[11px] text-success">
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-primary/60 bg-primary/10">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-destructive/50 bg-destructive/10 text-[11px] text-destructive">
        ✕
      </span>
    );
  }
  if (state === "stopped") {
    return (
      <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-warning/50 bg-warning/10 text-[11px] text-warning">
        !
      </span>
    );
  }
  return (
    <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-border text-[11px] text-muted-foreground/50">
      ○
    </span>
  );
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
