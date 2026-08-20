"use client";
import { useState, useRef, useEffect } from "react";

type Props = {
  /** Audit UUID: used for /api/audits/[id]/export/[format]. */
  auditId: string;
  /** Audit public slug: used for the print-mode preview URL only. */
  auditSlug: string;
  isPro: boolean;
};

export function ExportMenu({ auditId, auditSlug, isPro }: Props) {
  const [open, setOpen] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function onPdfClick() {
    if (isPro) {
      // Placeholder: server-rendered PDF not yet implemented. For now route to print CSS.
      window.open(`/r/${auditSlug}?print=1`, "_blank");
    } else {
      setShowPaywall(true);
    }
    setOpen(false);
  }

  return (
    <>
      <div ref={ref} className="relative inline-block">
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-[14px] border border-border-strong bg-background px-3 text-xs hover:bg-secondary"
        >
          Export
          <span aria-hidden className="text-muted-foreground">▾</span>
        </button>
        {open && (
          <div className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-[14px] border border-border/70 bg-background shadow-lg">
            <a
              href={`/api/audits/${auditId}/export/json`}
              className="block px-3 py-2 text-sm hover:bg-secondary"
              onClick={() => setOpen(false)}
            >
              JSON <span className="ml-1 font-mono text-[10px] text-muted-foreground">.json</span>
            </a>
            <a
              href={`/api/audits/${auditId}/export/md`}
              className="block px-3 py-2 text-sm hover:bg-secondary"
              onClick={() => setOpen(false)}
            >
              Markdown <span className="ml-1 font-mono text-[10px] text-muted-foreground">.md</span>
            </a>
            <button
              onClick={onPdfClick}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary"
            >
              <span>PDF</span>
              {!isPro && <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-primary">Pro</span>}
            </button>
          </div>
        )}
      </div>

      {showPaywall && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-5 backdrop-blur-sm"
          onClick={() => setShowPaywall(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-[22px] border border-border/70 bg-background p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-medium text-foreground">PDF export is Pro</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              JSON and Markdown are available on every tier; they&apos;re what the open-source CLI already produces.
              PDF export runs a headless browser per audit, which is infrastructure we only run for paying users.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowPaywall(false)}
                className="inline-flex h-9 items-center rounded-[14px] border border-border-strong px-3 text-xs hover:bg-secondary"
              >
                Close
              </button>
              <a
                href="/pricing"
                className="inline-flex h-9 items-center rounded-[14px] bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                See Pro →
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
