"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAnalytics } from "@/lib/analytics/use-analytics";

/**
 * Report CTA: turn an AI-triage diagnosis into an orchestrator run. Calls
 * POST /api/orchestrate with the audited domain plus a `brief` built from the
 * triage root causes, then redirects to the session-progress page at /o/<id>.
 *
 * This is the "diagnose → treat" bridge: the triage "Fix these first" list
 * becomes the brief that drives the (already-built) AI orchestrator, so the
 * two AI features read as one funnel. Unlike StartOrchestratorButton there's
 * no expanding form: the domain and brief are both already known.
 */
export function GenerateFixesButton({ domain, brief }: { domain: string; brief: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { track } = useAnalytics();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ domain, brief }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; limit?: number };
          setError(body.error ?? `failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as { sessionId: string };
        track({ name: "manifest_created" });
        router.push(`/o/${data.sessionId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="mt-4 flex flex-col gap-2">
      <button
        onClick={submit}
        disabled={pending}
        className="inline-flex h-10 w-fit items-center rounded-[14px] border border-primary/40 bg-primary/5 px-4 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 disabled:opacity-50"
      >
        {pending ? "Starting…" : "✨ Generate fixes"}
      </button>
      <p className="text-xs text-muted-foreground">
        Run the AI orchestrator on these root causes ($1–3).
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
