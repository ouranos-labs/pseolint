"use client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { addDomainAction } from "@/app/dashboard/domain-actions";

export function AddToMonitoringButton({ originUrl, className, children }: { originUrl: string; className: string; children: React.ReactNode }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function onClick() {
    start(async () => {
      const res = await addDomainAction(originUrl);
      if (!res.ok) { setErr(res.error); return; }
      router.push(`/dashboard/${res.slug}?welcome=1`);
    });
  }

  return (
    <>
      <button onClick={onClick} disabled={pending} className={className}>
        {pending ? "Adding…" : children}
      </button>
      {err && <span className="ml-2 text-xs text-destructive">{err}</span>}
    </>
  );
}
