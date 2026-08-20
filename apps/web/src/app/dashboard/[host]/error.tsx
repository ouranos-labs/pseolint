"use client";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-scoped error boundary for the domain workspace. Renders inside the
 * dashboard layout (sidebar stays put) instead of escalating to the global
 * app/error.tsx full-screen crash. Paired with the connection tuning + retry in
 * the page's data layer (see db/index.ts and lib/db-retry.ts), a transient Neon
 * blip should self-heal on the first render; this is the fallback if it doesn't.
 */
export default function DomainWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard/[host] error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 rounded-[28px] border border-border/70 bg-card/40 px-6 py-16 text-center">
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-destructive">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
        Couldn’t load this workspace
      </div>

      <h2
        className="text-balance text-2xl tracking-tight sm:text-3xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        We hit a hiccup loading your domain.
      </h2>

      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        This is usually a brief database connection blip rather than a problem
        with your data. Try again in a moment: your audits and findings are safe.
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
          All domains
        </Link>
      </div>
    </div>
  );
}
