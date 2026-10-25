"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { AuditErrorNotice } from "@/components/audit/audit-error-notice";
import { submitAudit } from "@/lib/audit-submit";
import type { AuditErrorView } from "@/lib/audit-errors";

export function ReauditButton({ sourceUrl, className }: { sourceUrl: string; className?: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<AuditErrorView | null>(null);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        disabled={pending || err?.cooldownUntil != null}
        title="Skip the 60-minute cache and run a fresh audit"
        onClick={() =>
          start(async () => {
            setErr(null);
            const result = await submitAudit({ url: sourceUrl, turnstileToken: "dev-skip", force: true });
            if (result.ok) router.push(result.next);
            else setErr(result.view);
          })
        }
        className={cn(
          "inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary",
          "disabled:opacity-60",
          className,
        )}
      >
        {pending ? "Starting…" : "Re-audit now"}
      </button>
      {err && <AuditErrorNotice view={err} onCooldownEnd={() => setErr(null)} className="w-full text-xs" />}
    </>
  );
}
