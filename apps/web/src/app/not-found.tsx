import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found · pseolint",
  description: "The page you were looking for doesn't exist or has expired.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-6 px-5 py-16 text-center">
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
        404 · page not found
      </div>

      <h1
        className="text-balance text-4xl tracking-tight sm:text-5xl lg:text-6xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        That page isn&apos;t here.
      </h1>

      <p className="max-w-md text-base leading-relaxed text-muted-foreground">
        It may have moved, the URL might have a typo, or the audit you&apos;re
        looking for has expired. Anonymous reports are kept 24 hours; signed-in
        free reports are kept 30 days.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Run a free audit
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium transition-colors hover:bg-secondary"
        >
          Open dashboard
        </Link>
      </div>

      <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <li>
          <Link href="/rules" className="hover:text-foreground hover:underline">
            Browse SpamBrain rules
          </Link>
        </li>
        <li aria-hidden>·</li>
        <li>
          <Link href="/tools" className="hover:text-foreground hover:underline">
            Free tools
          </Link>
        </li>
        <li aria-hidden>·</li>
        <li>
          <Link href="/methodology" className="hover:text-foreground hover:underline">
            Methodology
          </Link>
        </li>
        <li aria-hidden>·</li>
        <li>
          <Link href="/leaderboard" className="hover:text-foreground hover:underline">
            Leaderboard
          </Link>
        </li>
      </ul>
    </main>
  );
}
