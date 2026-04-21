import "./globals.css";
import { GeistSans, GeistMono } from "geist/font";
import { Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { NavRing } from "@/components/landing/nav-ring";
import { getOptionalSession } from "@/lib/session";

const displaySerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata = {
  title: "pseolint — SpamBrain-proof your pSEO",
  description: "Audit your programmatic SEO site for SpamBrain risk in 60 seconds.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getOptionalSession();
  return (
    <html lang="en" className={cn(GeistSans.variable, GeistMono.variable, displaySerif.variable)}>
      <body className="relative min-h-screen bg-background font-sans text-foreground antialiased">
        <SiteNav signedIn={!!session} />
        <div className="relative">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}

function SiteNav({ signedIn }: { signedIn: boolean }) {
  return (
    <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5 text-sm">
          <NavRing size={30} title="pseolint — 35 SpamBrain rules. Lights up as rules fire in the demo." />
          <span className="font-semibold tracking-tight">pseolint</span>
          <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
            v0.2.1
          </span>
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <Link
            href="/leaderboard"
            className="rounded-[12px] px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            Leaderboard
          </Link>
          <Link
            href="/pricing"
            className="rounded-[12px] px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
          <a
            href="https://github.com/ouranos-labs/pseolint"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="pseolint on GitHub"
            title="GitHub"
            className="inline-grid h-8 w-8 place-items-center rounded-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <GitHubMark />
          </a>
          {signedIn ? (
            <Link
              href="/dashboard"
              className="ml-2 inline-flex h-8 items-center rounded-[18px] bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/signin"
              className="ml-2 inline-flex h-8 items-center rounded-[18px] bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

function GitHubMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/60">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-10 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <NavRing size={28} title="pseolint mark" />
          <p>© {new Date().getFullYear()} Ouranos Labs · a static analyzer for programmatic SEO.</p>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/leaderboard" className="hover:text-foreground">Leaderboard</Link>
          <Link href="/limits" className="hover:text-foreground">Limits</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <a
            href="https://github.com/ouranos-labs/pseolint"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="pseolint on GitHub"
            title="GitHub"
            className="inline-flex items-center hover:text-foreground"
          >
            <GitHubMark className="h-4 w-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}
