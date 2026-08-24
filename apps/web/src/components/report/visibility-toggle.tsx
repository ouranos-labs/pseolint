"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function VisibilityToggle({
  auditId,
  initialIsPublic,
  isPro,
}: {
  auditId: string;
  initialIsPublic: boolean;
  isPro: boolean;
}) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [pending, start] = useTransition();
  const [showPaywall, setShowPaywall] = useState(false);
  const router = useRouter();

  function toggle() {
    const next = !isPublic;
    // Making private requires Pro: short-circuit with paywall if free.
    if (!next && !isPro) {
      setShowPaywall(true);
      return;
    }
    start(async () => {
      const res = await fetch(`/api/audits/${auditId}/visibility`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
      });
      if (res.ok) {
        setIsPublic(next);
        router.refresh();
      } else if (res.status === 402) {
        setShowPaywall(true);
      } else {
        alert(`Failed (${res.status})`);
      }
    });
  }

  return (
    <>
      <button
        onClick={toggle}
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-[14px] border border-border-strong bg-background px-3 text-xs hover:bg-secondary disabled:opacity-50"
        title={isPublic ? "This report is public (anyone with the link can view it" : "This report is private) only you can view it"}
      >
        <span
          aria-hidden
          className={`inline-block h-1.5 w-1.5 rounded-full ${isPublic ? "bg-warning" : "bg-primary"}`}
        />
        {pending ? "Updating…" : isPublic ? "Public" : "Private"}
      </button>

      {showPaywall && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-5 backdrop-blur-sm"
          onClick={() => setShowPaywall(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-[22px] border border-border/70 bg-background p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-medium text-foreground">Private reports are Pro</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Free and anon audits are publicly shareable via link; that&apos;s the whole point of the
              free tier. Toggling a report to private (require auth to view) is a Pro feature.
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
