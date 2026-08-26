"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reAuditNowAction, removeDomainAction } from "@/app/dashboard/domain-actions";
import { ConfirmDialog } from "./confirm-dialog";

export function WorkspaceHeader({ domain, domains = [] }: {
  domain: { host: string; sourceUrl: string };
  /** Every domain the user monitors, for the switcher. Omit to hide it. */
  domains?: { host: string; paused: boolean }[];
}) {
  const [pending, start] = useTransition();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function reaudit() {
    start(async () => {
      const res = await reAuditNowAction(domain.host);
      if (!res.ok) { setErr(res.error); return; }
      // Show /a progress UI, then return to the domain workspace on completion
      // (instead of the public /r/[slug] report) so monitoring context isn't lost.
      const next = `/dashboard/${encodeURIComponent(domain.host)}`;
      router.push(`/a/${res.auditId}?next=${encodeURIComponent(next)}`);
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
          <Link href="/dashboard" className="hover:text-foreground">Portfolio</Link>
          <span>/</span>
          <span className="text-foreground">{domain.host}</span>
        </nav>
        {/* Domain switcher. Native <details> rather than a popover library:
            it's keyboard-accessible and closes on navigation for free, and the
            list is short (a portfolio, not a search surface). A single-domain
            portfolio gets the plain heading, since there's nothing to switch to.
            ponytail: swap to a combobox if portfolios ever grow past ~20. */}
        {domains.length > 1 ? (
          <details className="group relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-2xl font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
              <h1>{domain.host}</h1>
              <span
                aria-hidden
                className="text-base text-muted-foreground transition-transform group-open:rotate-180"
              >
                ⌄
              </span>
              <span className="sr-only">Switch domain</span>
            </summary>
            <ul className="absolute left-0 top-full z-30 mt-1 max-h-80 w-64 overflow-y-auto rounded-[14px] border border-border-strong bg-card p-1 shadow-lg">
              {domains.map((d) => (
                <li key={d.host}>
                  <Link
                    href={`/dashboard/${encodeURIComponent(d.host)}`}
                    aria-current={d.host === domain.host ? "page" : undefined}
                    className={`flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-sm transition-colors hover:bg-secondary ${
                      d.host === domain.host ? "bg-secondary text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="truncate">{d.host}</span>
                    {d.paused && (
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        Paused
                      </span>
                    )}
                  </Link>
                </li>
              ))}
              <li className="mt-1 border-t border-border/60 pt-1">
                <Link
                  href="/dashboard"
                  className="block rounded-[10px] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  All domains →
                </Link>
              </li>
            </ul>
          </details>
        ) : (
          <h1 className="text-2xl font-medium text-foreground">{domain.host}</h1>
        )}
        <a
          href={domain.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          ↗ {domain.sourceUrl}
        </a>
      </div>
      <div className="flex w-full flex-col gap-1 sm:w-auto sm:items-end">
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button onClick={reaudit} disabled={pending}>{pending ? "Starting…" : "Re-audit now"}</Button>
          <Link href={`/dashboard/${encodeURIComponent(domain.host)}/settings`} className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm hover:bg-secondary">Settings</Link>
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
        description={`We'll stop the recurring diff-audits and full re-audits. Your audit history is preserved; you can re-add the domain later.${err ? `\n\nError: ${err}` : ""}`}
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
