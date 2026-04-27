"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ReauditButton({ sourceUrl }: { sourceUrl: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        title="Skip the 60-minute cache and run a fresh audit"
        onClick={() =>
          start(async () => {
            setErr(null);
            try {
              const res = await fetch("/api/audits", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ url: sourceUrl, turnstileToken: "dev-skip", force: true }),
              });
              if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                setErr(body.error ?? `Failed (${res.status})`);
                return;
              }
              const { auditId, reportUrl, cached } = (await res.json()) as {
                auditId: string;
                reportUrl?: string;
                cached?: boolean;
              };
              router.push(cached && reportUrl ? reportUrl : `/a/${auditId}`);
            } catch (e) {
              setErr((e as Error).message);
            }
          })
        }
        className="inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
      >
        {pending ? "Starting…" : "Re-audit now"}
      </button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </>
  );
}
