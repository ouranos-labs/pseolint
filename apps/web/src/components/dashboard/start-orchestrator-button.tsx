"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAnalytics } from "@/lib/analytics/use-analytics";

/**
 * Dashboard CTA: start an AI-orchestrated audit. Calls POST /api/orchestrate
 * with the domain the user types in, then redirects to the session-progress
 * page at /o/<id>. The progress page auto-redirects to /m/<slug> once the
 * manifest is ready.
 *
 * Copy is placeholder — refine post-§11 (pricing message, BYOK split, etc.).
 */
export function StartOrchestratorButton() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { track } = useAnalytics();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ domain }),
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex h-10 items-center rounded-[14px] border border-primary/40 bg-primary/5 px-4 text-sm font-medium text-foreground transition-colors hover:bg-primary/10"
      >
        ✨ Run AI orchestrator
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-[18px] border border-primary/30 bg-primary/5 p-5">
      <div>
        <p className="text-sm font-medium text-foreground">AI-orchestrated audit</p>
        <p className="mt-1 text-xs text-muted-foreground">
          An LLM drives 26 audit tools and produces concrete fix patches (H1 rewrites, JSON-LD blocks, robots.txt diffs, AEO citation-lift FAQs). Costs $1-3 per audit on managed Anthropic.
        </p>
      </div>
      <input
        type="url"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="https://example.com"
        required
        className="rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm font-mono"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !domain}
          className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Starting…" : "Start audit"}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setError(null);
          }}
          className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground hover:bg-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
