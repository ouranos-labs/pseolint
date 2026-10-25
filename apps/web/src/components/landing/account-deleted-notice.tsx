"use client";
import { useEffect, useState } from "react";

/**
 * Confirms an account deletion (settings deletes, then redirects to
 * `/?deleted=1`). Reads `location` in an effect rather than useSearchParams so
 * the landing page stays statically rendered without a Suspense boundary.
 * The param is stripped right away so a refresh or a shared URL won't repeat it.
 */
export function AccountDeletedNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("deleted") !== "1") return;
    setShow(true);
    url.searchParams.delete("deleted");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  if (!show) return null;
  return (
    <div className="mx-auto mt-4 w-full max-w-3xl px-5">
      <div
        role="status"
        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground/90"
      >
        <span>Your account was deleted.</span>
        <button
          type="button"
          onClick={() => setShow(false)}
          aria-label="Dismiss"
          className="rounded-full px-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          ×
        </button>
      </div>
    </div>
  );
}
