"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reAuditNowAction, removeDomainAction } from "@/app/dashboard/domain-actions";
import { ConfirmDialog } from "./confirm-dialog";

type Run = { slug: string; score: number | null; completedAt: Date | null };

export function WorkspaceHeader({ domain, runs }: {
  domain: { slug: string; host: string; sourceUrl: string; lastScore: number | null };
  runs: Run[];
}) {
  const [pending, start] = useTransition();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const completedRuns = runs.filter((r) => r.score != null);
  const prevScore = completedRuns[1]?.score ?? null;
  const currentScore = domain.lastScore ?? completedRuns[0]?.score ?? null;
  const delta = currentScore != null && prevScore != null ? currentScore - prevScore : null;

  function reaudit() {
    start(async () => {
      const res = await reAuditNowAction(domain.slug);
      if (!res.ok) { alert(res.error); return; }
      router.refresh();
    });
  }

  function confirmRemove() {
    start(async () => {
      const res = await removeDomainAction(domain.slug);
      if (!res.ok) { setErr(res.error); return; }
      setRemoveOpen(false);
      router.push("/dashboard");
    });
  }

  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
      <div>
        <nav className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <a href="/dashboard" className="hover:text-foreground">Portfolio</a>
          <span>/</span>
          <span className="text-foreground">{domain.host}</span>
        </nav>
        <h1 className="text-2xl font-medium text-foreground">{domain.host}</h1>
        <div className="mt-1 flex items-baseline gap-3 text-sm text-muted-foreground">
          <span className="font-mono tabular-nums text-3xl text-foreground">{currentScore ?? "—"}</span>
          {delta != null && (
            <span className={delta >= 0 ? "text-primary" : "text-destructive"}>
              {delta >= 0 ? "+" : ""}{delta}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={reaudit} disabled={pending}>{pending ? "Starting…" : "Re-audit now"}</Button>
        <a href={`/dashboard/${domain.slug}/settings`} className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm hover:bg-secondary">Settings</a>
        <button
          onClick={() => { setErr(null); setRemoveOpen(true); }}
          disabled={pending}
          className="inline-flex h-10 items-center rounded-[14px] border border-destructive/50 px-4 text-sm text-destructive hover:bg-destructive/10"
        >
          Remove
        </button>
      </div>
      <ConfirmDialog
        open={removeOpen}
        title={`Stop monitoring ${domain.host}?`}
        description={`We'll stop running daily diff-audits and weekly full re-audits. Your audit history is preserved — you can re-add the domain later.${err ? `\n\nError: ${err}` : ""}`}
        confirmWord={domain.host}
        confirmLabel="Stop monitoring"
        danger
        pending={pending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveOpen(false)}
      />
    </header>
  );
}
