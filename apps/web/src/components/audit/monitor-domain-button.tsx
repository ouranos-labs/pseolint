"use client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { addMonitoredDomain } from "@/app/dashboard/actions";

export function MonitorDomainButton({ sourceUrl }: { sourceUrl: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const res = await addMonitoredDomain(sourceUrl);
            if (!res.ok) {
              setErr(res.error);
              return;
            }
            router.push("/dashboard");
          })
        }
        className="inline-flex h-11 items-center rounded-[18px] border border-primary/40 bg-primary/10 px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Monitor this domain"}
      </button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </>
  );
}
