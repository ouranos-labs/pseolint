"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reAuditNowAction } from "@/app/dashboard/domain-actions";
import { friendlyActionError } from "@/lib/action-result";

/** Re-runs a failed audit and follows it on the live progress page. */
export function RetryAuditButton({ host }: { host: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function retry() {
    setErr(null);
    start(async () => {
      const res = await reAuditNowAction(host).catch(() => null);
      if (!res) { setErr("Couldn't reach the server. Check your connection and try again."); return; }
      if (!res.ok) { setErr(friendlyActionError(res.error)); return; }
      const next = `/dashboard/${encodeURIComponent(host)}`;
      router.push(`/a/${res.auditId}?next=${encodeURIComponent(next)}`);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        className="inline-flex h-9 w-fit items-center rounded-[14px] bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Queuing…" : "Retry audit"}
      </button>
      {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
