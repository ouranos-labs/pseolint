"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyDomainAction } from "@/app/dashboard/domain-actions";
import type { ProviderInfo } from "@/lib/dns-provider";

export function VerifyBanner({
  host,
  token,
  provider,
}: {
  host: string;
  token: string | null;
  provider: ProviderInfo | null;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const recordName = `_pseolint-verify.${host}`;
  const recordValue = token ?? " (regenerating, retry verify) ";

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function verify() {
    start(async () => {
      setErr(null);
      const res = await verifyDomainAction(host);
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    });
  }

  return (
    <aside className="rounded-[18px] border border-warning/30 bg-warning/5 p-5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
        <h2 className="text-sm font-semibold text-foreground">Verify ownership to start monitoring</h2>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Add this TXT record to <span className="font-mono text-foreground">{host}</span>&apos;s DNS. We re-check every 5 minutes for the first 24 hours, so you don&apos;t need to come back and click anything once it&apos;s saved.
      </p>

      {provider && (
        <div className="mt-3 flex flex-col gap-2 rounded-[14px] border border-primary/30 bg-primary/5 p-3 text-xs sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-foreground">
              Detected <span className="font-medium">{provider.name}</span> as your DNS provider.
            </p>
            {provider.tip && <p className="mt-1 text-muted-foreground">{provider.tip}</p>}
          </div>
          <a
            href={provider.dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 shrink-0 items-center rounded-[12px] bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open {provider.name} →
          </a>
        </div>
      )}

      <dl className="mt-4 grid gap-3 rounded-[14px] border border-border/60 bg-background/60 p-4 text-xs font-mono sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <dt className="uppercase tracking-wider text-muted-foreground">Type</dt>
        <dd className="text-foreground">TXT</dd>
        <dd />
        <dt className="uppercase tracking-wider text-muted-foreground">Name</dt>
        <dd className="truncate text-foreground">{recordName}</dd>
        <dd>
          <button onClick={() => copy(recordName)} className="text-muted-foreground hover:text-foreground">copy</button>
        </dd>
        <dt className="uppercase tracking-wider text-muted-foreground">Value</dt>
        <dd className="truncate text-foreground">{recordValue}</dd>
        <dd>
          {token && <button onClick={() => copy(token)} className="text-muted-foreground hover:text-foreground">copy</button>}
        </dd>
      </dl>
      {copied && <p className="mt-1 text-[10px] text-primary">copied</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={verify}
          disabled={pending}
          className="inline-flex h-9 items-center rounded-[14px] bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Checking DNS…" : "Check now"}
        </button>
        {err && <span className="text-xs text-destructive">{err}</span>}
      </div>
    </aside>
  );
}
