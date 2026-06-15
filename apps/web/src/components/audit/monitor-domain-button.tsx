"use client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addMonitoredDomain } from "@/app/dashboard/actions";
import { useAnalytics } from "@/lib/analytics/use-analytics";

export function MonitorDomainButton({
  sourceUrl,
  isPro,
  auditSlug,
}: {
  sourceUrl: string;
  isPro: boolean;
  auditSlug?: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const { track } = useAnalytics();

  // Free users: route to /pricing with monitor-intent so the post-checkout
  // webhook auto-binds this audit's domain. Skips the silent-failure where
  // a free user adds a domain but the cron filters them out.
  if (!isPro) {
    const href = auditSlug
      ? `/pricing?intent=monitor&audit=${encodeURIComponent(auditSlug)}`
      : "/pricing?intent=monitor";
    return (
      <Link
        href={href}
        className="inline-flex h-11 items-center rounded-[18px] border border-primary/40 bg-primary/10 px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
      >
        Monitor this domain · Pro →
      </Link>
    );
  }

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
            try {
              const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
              track({ name: "monitoring_domain_added", props: { host } });
            } catch { /* malformed URL — skip tracking */ }
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
