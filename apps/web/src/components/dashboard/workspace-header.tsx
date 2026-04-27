"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reAuditNowAction, removeDomainAction } from "@/app/dashboard/domain-actions";
import { ConfirmDialog } from "./confirm-dialog";

export function WorkspaceHeader({ domain }: {
  domain: { host: string; sourceUrl: string };
}) {
  const [pending, start] = useTransition();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function reaudit() {
    start(async () => {
      const res = await reAuditNowAction(domain.host);
      if (!res.ok) { setErr(res.error); return; }
      // Standard /a → /r flow, same as free tier and add-domain.
      router.push(`/a/${res.auditId}`);
    });
  }

  function confirmRemove() {
    start(async () => {
      const res = await removeDomainAction(domain.host);
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
        <a
          href={domain.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          ↗ {domain.sourceUrl}
        </a>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <Button onClick={reaudit} disabled={pending}>{pending ? "Starting…" : "Re-audit now"}</Button>
          <a href={`/dashboard/${encodeURIComponent(domain.host)}/settings`} className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm hover:bg-secondary">Settings</a>
          <button
            onClick={() => { setErr(null); setRemoveOpen(true); }}
            disabled={pending}
            className="inline-flex h-10 items-center rounded-[14px] border border-destructive/50 px-4 text-sm text-destructive hover:bg-destructive/10"
          >
            Remove
          </button>
        </div>
        {err && !removeOpen && <span className="text-xs text-destructive">{err}</span>}
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
