"use client";

import { useState, useTransition } from "react";
import { claimHostAction, getDnsClaimInstructionsAction } from "@/app/leaderboard/claim-actions";
import { toast } from "sonner";

export function ClaimCta({ host, claimed, ownedByViewer }: { host: string; claimed: boolean; ownedByViewer: boolean }) {
  const [pending, start] = useTransition();
  const [dns, setDns] = useState<{ name: string; value: string } | null>(null);

  if (claimed && ownedByViewer) {
    const badge = `${typeof window !== "undefined" ? window.location.origin : ""}/api/badge/${encodeURIComponent(host)}`;
    const snippet = `<a href="https://pseolint.dev/leaderboard"><img src="${badge}" alt="Audited clean by pseolint" /></a>`;
    return (
      <div className="mt-6 rounded-[22px] border border-success/25 bg-success/5 p-5">
        <p className="text-sm font-medium text-foreground">✓ You own this listing.</p>
        <p className="mt-1 text-xs text-muted-foreground">Embed your verified badge — it links back to the leaderboard:</p>
        <pre className="mt-2 overflow-x-auto rounded-[10px] border border-border/60 bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">{snippet}</pre>
      </div>
    );
  }
  if (claimed) return null;

  function attempt() {
    start(async () => {
      const res = await claimHostAction(host);
      if ("ok" in res) { toast.success(`Verified via ${res.method.toUpperCase()} — listing claimed.`); location.reload(); }
      else {
        toast.error(res.error);
        if (!dns) setDns(await getDnsClaimInstructionsAction(host));
      }
    });
  }

  return (
    <div className="mt-6 rounded-[22px] border border-primary/25 bg-primary/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Is this your site?</p>
          <p className="mt-1 text-xs text-muted-foreground">Claim it to manage the listing, get a verified badge, and a followed backlink.</p>
        </div>
        <button type="button" disabled={pending} onClick={attempt}
          className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? "Verifying…" : "Claim this site"}
        </button>
      </div>
      {dns && (
        <div className="mt-3 rounded-[10px] border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground">
          <p>Add this DNS TXT record, then click "Claim this site" again:</p>
          <p className="mt-1 font-mono text-foreground">{dns.name}</p>
          <p className="font-mono text-foreground">{dns.value}</p>
          <p className="mt-1">(Or connect Google Search Console for this property for instant verification.)</p>
        </div>
      )}
    </div>
  );
}
