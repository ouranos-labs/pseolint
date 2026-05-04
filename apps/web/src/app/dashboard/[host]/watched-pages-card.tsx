"use client";
import { useId, useRef, useState, useTransition } from "react";
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
  const inputId = useId();
  const helpId = useId();
  const errId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const atCap = rows.length >= CAP;

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (atCap) return;
    start(async () => {
      const res = await addWatchedPage(monitoredDomainId, url);
      if (!res.ok) {
        setErr(res.error);
        inputRef.current?.focus();
        return;
      }
      setRows((prev) => [
        ...prev,
        { id: res.id, url: normalizeUserUrl(url) ?? url, createdAt: new Date(), lastAuditedAt: null },
      ]);
      setUrl("");
      inputRef.current?.focus();
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
      // Return focus to the input so keyboard context isn't lost on unmount.
      inputRef.current?.focus();
    });
  }

  const describedBy = err ? `${helpId} ${errId}` : helpId;

  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-border/60 p-5" aria-labelledby={`${inputId}-heading`}>
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h2 id={`${inputId}-heading`} className="text-sm font-medium">Watched pages</h2>
          <p id={helpId} className="mt-1 text-xs text-muted-foreground">
            Pin URLs that matter most — they&apos;re re-fetched on every monitoring run, even when nothing else has changed. Up to {CAP} per domain.
          </p>
        </div>
        <span
          className="font-mono text-xs tabular-nums text-muted-foreground"
          aria-label={`${rows.length} of ${CAP} watched pages used`}
        >
          {rows.length} / {CAP}
        </span>
      </header>

      <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">URL to watch</label>
        <Input
          id={inputId}
          ref={inputRef}
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
          aria-describedby={describedBy}
          aria-invalid={err ? true : undefined}
          className="h-10 flex-1"
        />
        <Button type="submit" disabled={atCap || pending || !url.trim()} className="h-10 sm:w-32">
          {pending ? "Adding…" : "Watch URL"}
        </Button>
      </form>

      {(atCap || err) && (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          {atCap && (
            <p className="text-xs text-warning">
              Pro is capped at {CAP} watched pages per domain. Remove one or contact support for a higher limit.
            </p>
          )}
          {err && <p id={errId} className="text-xs text-destructive">{err}</p>}
        </div>
      )}

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
                aria-label={`Remove ${r.url} from watched pages`}
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
