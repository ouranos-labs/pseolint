"use client";
import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-6 px-5 py-16 text-center">
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-destructive">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
        Something broke
      </div>

      <h1
        className="text-balance text-4xl tracking-tight sm:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        We hit an unexpected error.
      </h1>

      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        The page failed to render. The issue has been logged. You can retry, or
        head somewhere else and try again in a moment.
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
          href="/"
          className="inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium transition-colors hover:bg-secondary"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
