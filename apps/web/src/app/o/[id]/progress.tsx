"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SessionStatus {
  sessionId: string;
  domain: string;
  status: "queued" | "running" | "completed" | "failed" | "aborted";
  reason: string | null;
  budgetUsd: number;
  spentUsd: number;
  inputTokens: number;
  outputTokens: number;
  toolCallCount: number;
  durationMs: number | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  manifest: { slug: string; verdict: string; validPatchCount: number; totalPatchCount: number } | null;
}

const POLL_INTERVAL_MS = 3000;

export function OrchestratorProgress({
  sessionId,
  initialDomain,
  initialStatus,
}: {
  sessionId: string;
  initialDomain: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/orchestrate/${sessionId}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError(`status fetch failed: ${res.status}`);
          return;
        }
        const data = (await res.json()) as SessionStatus;
        if (cancelled) return;
        setStatus(data);
        // Auto-redirect to manifest once it's ready.
        if (data.status === "completed" && data.manifest) {
          window.location.href = `/m/${data.manifest.slug}`;
          return;
        }
        // Stop polling on terminal status that didn't produce a manifest.
        if (data.status === "completed" || data.status === "failed" || data.status === "aborted") {
          return;
        }
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        timer = setTimeout(tick, POLL_INTERVAL_MS * 2); // back off on error
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  const display = status ?? {
    sessionId,
    domain: initialDomain,
    status: initialStatus as SessionStatus["status"],
    reason: null,
    budgetUsd: 0,
    spentUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    toolCallCount: 0,
    durationMs: null,
    errorMessage: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    manifest: null,
  };

  const elapsedSec = display.durationMs
    ? display.durationMs / 1000
    : (Date.now() - new Date(display.startedAt).getTime()) / 1000;

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <span aria-hidden>←</span> Back to dashboard
      </Link>

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot(display.status)}`} />
        Orchestrator session · {display.status}
      </div>

      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        {display.domain}
      </h1>

      <div className="mt-6 rounded-[22px] border border-border/60 bg-card/40 p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <p className="text-sm font-medium text-foreground">{statusLabel(display.status)}</p>
          {display.status === "running" && (
            <span className="font-mono text-[11px] text-muted-foreground">polling every 3s</span>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <Stat label="Tool calls" value={display.toolCallCount} />
          <Stat
            label="Cost"
            value={`$${display.spentUsd.toFixed(3)}`}
            sub={`of $${display.budgetUsd.toFixed(2)}`}
          />
          <Stat label="Duration" value={`${elapsedSec.toFixed(1)}s`} />
          <Stat label="Tokens" value={`${(display.inputTokens / 1000).toFixed(1)}K in`} sub={`${display.outputTokens} out`} />
        </dl>
      </div>

      {error && (
        <div className="mt-4 rounded-[14px] border border-warning/30 bg-warning/5 p-4 text-xs text-muted-foreground">
          Polling hiccup: {error}. Will retry.
        </div>
      )}

      {display.status === "failed" && display.errorMessage && (
        <div className="mt-4 rounded-[18px] border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive">
          <p className="font-medium">Session failed</p>
          <p className="mt-1 font-mono text-xs">{display.errorMessage}</p>
          {display.reason && <p className="mt-1 font-mono text-xs">reason: {display.reason}</p>}
        </div>
      )}

      {(display.status === "running" || display.status === "queued") && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <CancelButton sessionId={sessionId} />
          <span className="text-xs text-muted-foreground">
            Live event tailing (SSE) is on the roadmap — for now the page polls every 3s.
          </span>
        </div>
      )}
    </main>
  );
}

function CancelButton({ sessionId }: { sessionId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orchestrate/${sessionId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `cancel failed (${res.status})`);
        return;
      }
      // Refresh the page state — the next poll will pick up status=aborted.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex h-9 items-center rounded-[12px] border border-border-strong px-3 text-xs font-medium text-muted-foreground hover:bg-secondary"
      >
        Cancel session
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">In-flight LLM steps may still bill.</span>
      <button
        onClick={cancel}
        disabled={pending}
        className="inline-flex h-9 items-center rounded-[12px] border border-destructive/50 bg-destructive/10 px-3 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
      >
        {pending ? "Cancelling…" : "Confirm cancel"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="inline-flex h-9 items-center rounded-[12px] border border-border-strong px-3 text-xs font-medium text-muted-foreground hover:bg-secondary"
      >
        Keep running
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

function statusLabel(s: SessionStatus["status"]): string {
  switch (s) {
    case "queued": return "Queued — orchestrator job will pick this up shortly.";
    case "running": return "Running — the LLM is calling tools and producing the manifest.";
    case "completed": return "Completed.";
    case "failed": return "Failed.";
    case "aborted": return "Aborted.";
  }
}

function statusDot(s: SessionStatus["status"]): string {
  switch (s) {
    case "queued": return "bg-muted-foreground";
    case "running": return "bg-warning animate-pulse";
    case "completed": return "bg-success";
    case "failed": return "bg-destructive";
    case "aborted": return "bg-muted-foreground";
  }
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col text-nowrap">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="font-mono text-lg tabular-nums text-foreground">{value}</dd>
      {sub && <span className="font-mono text-[10px] text-muted-foreground/70">{sub}</span>}
    </div>
  );
}
