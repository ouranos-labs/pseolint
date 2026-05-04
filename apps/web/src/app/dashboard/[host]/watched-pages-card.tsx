"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeUserUrl } from "@/lib/normalize-url";
import { addWatchedPage, removeWatchedPage } from "@/app/dashboard/domain-actions";
import { WATCHED_PAGES_CAP } from "@/lib/audit-limits";

export type WatchedPageRow = {
  id: string;
  url: string;
  createdAt: Date | string;
  lastAuditedAt: Date | string | null;
};

const CAP = WATCHED_PAGES_CAP.pro;

/**
 * Pro: shows the watched-pages list for one monitored domain plus an add form.
 * Disables the add input at the 20-page cap. Free path renders the upgrade CTA
 * variant — see `WatchedPagesUpgradeCta`.
 */
export function WatchedPagesCard({
  monitoredDomainId,
  host,
  initialRows,
}: {
  monitoredDomainId: string;
  host: string;
  initialRows: WatchedPageRow[];
}) {
  const [rows, setRows] = useState<WatchedPageRow[]>(initialRows);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const atCap = rows.length >= CAP;

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (atCap) return;
    start(async () => {
      const res = await addWatchedPage(monitoredDomainId, url);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      // Optimistic row — server has already inserted; full state will reload
      // on the next nav/refresh. The audit kicked off by the action runs
      // asynchronously; lastAuditedAt fills in once that completes.
      setRows((prev) => [
        ...prev,
        { id: res.id, url: normalizeUserUrl(url) ?? url, createdAt: new Date(), lastAuditedAt: null },
      ]);
      setUrl("");
    });
  }

  function onRemove(id: string) {
    setErr(null);
    start(async () => {
      const res = await removeWatchedPage(id);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-border/60 p-5">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Watched pages</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pin URLs that matter most — they&apos;re re-fetched on every monitoring run, even when nothing else has changed. Up to {CAP} per domain.
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {rows.length} / {CAP}
        </span>
      </header>

      <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => { const n = normalizeUserUrl(url); if (n) setUrl(n); }}
          placeholder={`https://${host}/your-most-important-page`}
          disabled={atCap || pending}
          className="h-10 flex-1"
        />
        <Button type="submit" disabled={atCap || pending || !url.trim()} className="h-10 sm:w-32">
          {pending ? "Adding…" : "Watch URL"}
        </Button>
      </form>

      {atCap && (
        <p className="text-xs text-warning">
          Pro is capped at {CAP} watched pages per domain. Remove one or contact support for a higher limit.
        </p>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}

      {rows.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-border/60 bg-background/40 p-4 text-xs text-muted-foreground">
          No pages watched yet. Pin the URLs that matter most — they&apos;ll be audited on every monitoring run, even when nothing else has changed.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-[10px] border border-border/50 bg-card/40 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={r.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block truncate font-mono text-xs text-foreground hover:text-primary"
                >
                  {r.url}
                </Link>
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {r.lastAuditedAt
                    ? `Last audited ${new Date(r.lastAuditedAt).toLocaleString()}`
                    : "Audit pending — first run kicked off"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemove(r.id)}
                disabled={pending}
                className="inline-flex h-8 items-center rounded-[10px] border border-border/60 px-2 text-[11px] text-muted-foreground hover:border-destructive/60 hover:text-destructive disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Free-tier rendering of the Watched pages slot. Server-side and inert:
 * shows the same surface so the feature is discoverable without exposing
 * any add UI. Click-through points at /pricing.
 */
export function WatchedPagesUpgradeCta() {
  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-border/60 bg-card/40 p-5">
      <h2 className="text-sm font-medium">Watched pages</h2>
      <p className="text-xs text-muted-foreground">
        Pin specific URLs to guarantee they&apos;re re-fetched on every monitoring run. Catches regressions on your money pages even when the rest of the site hasn&apos;t changed.
      </p>
      <Link
        href="/pricing"
        className="inline-flex h-9 w-fit items-center rounded-[14px] bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        Upgrade to Pro
      </Link>
    </section>
  );
}
