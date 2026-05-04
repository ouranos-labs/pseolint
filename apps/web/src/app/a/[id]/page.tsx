"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ScanningTiles } from "@/components/audit/scanning-tiles";

// Only allow same-origin relative paths to prevent open-redirect via ?next=.
function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

type Status = "queued" | "running" | "completed" | "failed" | string;

const STEPS: { key: Status; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "running", label: "Crawling + scoring" },
  { key: "completed", label: "Report ready" },
];

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [status, setStatus] = useState<Status>("queued");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = safeNext(searchParams.get("next"));

  useEffect(() => {
    const start = Date.now();
    const clockId = setInterval(
      () => setElapsed(Math.round((Date.now() - start) / 1000)),
      500,
    );
    return () => clearInterval(clockId);
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/audits/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setStatus(json.status);
        if (typeof json.sourceUrl === "string") setSourceUrl(json.sourceUrl);
        if (json.status === "completed") {
          router.replace(nextParam ?? `/r/${json.slug ?? id}`);
          return;
        }
        if (json.status === "failed") {
          setErr(json.errorMessage ?? "Audit failed");
          return;
        }
      } catch (e) {
        setErr((e as Error).message);
      }
      if (!stopped) setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stopped = true;
    };
  }, [id, router, nextParam]);

  const activeIndex = STEPS.findIndex((s) => s.key === status);
  const host = hostOf(sourceUrl);

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            err ? "bg-destructive" : "animate-pulse bg-primary"
          }`}
        />
        {err ? "Audit failed" : "Running audit"}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
        <h1
          className="text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          {host ?? "Preparing crawl…"}
        </h1>
        <span className="font-mono text-xs text-muted-foreground">audit · {id.slice(0, 8)}</span>
      </div>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        Crawling up to 200 pages, classifying templates, scoring against the SpamBrain + AEO rule set. Usually
        30–120 seconds. Safe to leave this page open — your report link is already stable.
      </p>

      <div className="mt-8 overflow-hidden rounded-[28px] border border-border/70 bg-card/60 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-3.5 text-xs">
          <span className="font-mono text-muted-foreground">{host ?? "—"}</span>
          <span className="font-mono tabular-nums text-muted-foreground">{elapsed}s</span>
        </div>

        <div className="px-6 pb-4 pt-6">
          <ScanningTiles title="Live scan preview — decorative" />
        </div>

        <ul className="flex flex-col gap-3 border-t border-border/60 px-6 py-5">
          {STEPS.map((s, i) => {
            const done = !err && (activeIndex > i || status === "completed");
            const active =
              !err && !done && (activeIndex === i || (activeIndex === -1 && i === 0));
            const failed = !!err && i === Math.max(activeIndex, 0);
            return (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <StatusGlyph
                  state={failed ? "failed" : done ? "done" : active ? "active" : "idle"}
                />
                <span className={done || active ? "text-foreground" : "text-muted-foreground/60"}>
                  {s.label}
                </span>
                {active && !err && (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-primary">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    live
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {err && <AuditErrorBlock err={err} sourceUrl={sourceUrl} />}
      </div>
    </main>
  );
}

/**
 * Renders the audit's failure state. Detects OriginDegradedError specifically
 * and replaces the engine's technical message with a structured explanation
 * plus three concrete next steps the user can act on. All other failures fall
 * through to the generic "common causes" block.
 */
function AuditErrorBlock({ err, sourceUrl }: { err: string; sourceUrl: string | null }) {
  const isDegraded = /Origin looks degraded|OriginDegradedError/i.test(err);

  // Pull the diagnostic numbers if the engine produced its formatted message.
  // Format is: "...p95=NNNms, baseline=NNNms, 5xx=NN%, fetches=NN."
  const diag = isDegraded ? parseDegradationDiagnostics(err) : null;
  const tryAgainHref = sourceUrl ? `/?prefill=${encodeURIComponent(sourceUrl)}` : "/";
  const settingsHref = sourceUrl
    ? (() => {
        try {
          const host = new URL(sourceUrl).host;
          return `/dashboard/${encodeURIComponent(host)}/settings`;
        } catch { return null; }
      })()
    : null;

  if (isDegraded) {
    return (
      <div className="m-6 mt-0 flex flex-col gap-4 rounded-[18px] border border-warning/40 bg-warning/5 p-5 text-sm">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-warning">
            audit aborted · origin protection
          </p>
          <p className="mt-1.5 text-foreground">
            We stopped the crawl because your origin slowed down significantly while we
            were auditing — typically a sign the cache went cold or the site started
            rate-limiting us. The audit is paused, not penalised; nothing was charged.
          </p>
        </div>
        {diag && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-[12px] border border-warning/25 bg-background/40 px-3 py-2.5 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Baseline p95</dt>
              <dd className="mt-0.5 font-mono tabular-nums text-foreground">{diag.baseline}ms</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Rolling p95</dt>
              <dd className="mt-0.5 font-mono tabular-nums text-warning">{diag.p95}ms</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">5xx rate</dt>
              <dd className="mt-0.5 font-mono tabular-nums text-foreground">{diag.errorPct}%</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Fetches</dt>
              <dd className="mt-0.5 font-mono tabular-nums text-foreground">{diag.fetches}</dd>
            </div>
          </dl>
        )}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            What to do next
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5 text-xs text-foreground/90">
            <li className="flex gap-2">
              <span className="mt-[3px] inline-block h-1 w-1 shrink-0 rounded-full bg-warning/70" />
              <span>
                <span className="font-medium">Warm the cache.</span>{" "}
                Visit a few pages once so your CDN / origin caches them, then re-run the audit.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-[3px] inline-block h-1 w-1 shrink-0 rounded-full bg-warning/70" />
              <span>
                <span className="font-medium">Enable Gentle audit mode.</span>{" "}
                Caps audits to 2 parallel fetches and 200 pages so a small origin
                isn&apos;t overwhelmed. Toggle it in domain settings.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-[3px] inline-block h-1 w-1 shrink-0 rounded-full bg-warning/70" />
              <span>
                <span className="font-medium">Check rate-limiting.</span>{" "}
                If your origin throttles repeated requests from one IP, allow-list
                <code className="mx-1 font-mono text-[11px]">user-agent: pseolint</code>
                or audit again later when traffic is quieter.
              </span>
            </li>
          </ul>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href={tryAgainHref}
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </Link>
          {settingsHref && (
            <Link
              href={settingsHref}
              className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Domain settings →
            </Link>
          )}
          <details className="ml-auto self-center text-xs text-muted-foreground">
            <summary className="cursor-pointer">Engine output</summary>
            <p className="mt-1.5 max-w-2xl font-mono text-[11px] text-muted-foreground/80">{err}</p>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div className="m-6 mt-0 flex flex-col gap-4 rounded-[18px] border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="text-destructive">{err}</p>
      <p className="text-xs text-muted-foreground">
        Common causes: the site blocked our crawler, the URL isn&apos;t reachable, or it
        served no indexable pages. Try a different URL or the root domain.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href={tryAgainHref}
          className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Back to home
        </Link>
      </div>
    </div>
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

function StatusGlyph({ state }: { state: "done" | "active" | "idle" | "failed" }) {
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
