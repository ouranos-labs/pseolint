"use client";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary for every dashboard page that doesn't have its own (API keys,
 * settings, integrations, manifests...). It renders inside the dashboard layout,
 * so the sidebar stays and the user keeps their bearings instead of landing on
 * the full-screen root error. [host]/error.tsx still handles the domain
 * workspace with its own copy.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 rounded-[28px] border border-border/70 bg-card/40 px-6 py-16 text-center">
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-destructive">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
        Couldn&apos;t load this page
      </div>

      <h2
        className="text-balance text-2xl tracking-tight sm:text-3xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        Something went wrong on our side.
      </h2>

      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        Your domains, audits and settings are safe. This is usually a brief
        connection problem; trying again normally fixes it. If it keeps
        happening, go back to your domains and retry in a minute.
      </p>

      {error.digest && (
        <p className="font-mono text-[11px] text-muted-foreground/80">
          ref: <span className="text-foreground/80">{error.digest}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium transition-colors hover:bg-secondary"
        >
          Back to your domains
        </Link>
      </div>
    </div>
  );
}
