import "./globals.css";
import { GeistSans, GeistMono } from "geist/font";
import { Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { NavRing } from "@/components/landing/nav-ring";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { AccountMenu } from "@/components/dashboard/account-menu";

const displaySerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const SITE_LAST_UPDATED = new Date().toISOString().slice(0, 10);

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "pseolint — SpamBrain-proof your pSEO",
  description: "Audit your programmatic SEO site for SpamBrain risk in 60 seconds.",
  authors: [{ name: "pseolint Editorial Team", url: SITE_URL }],
  creator: "Ouranos Labs",
  publisher: "Ouranos Labs",
  alternates: { canonical: "/" },
  openGraph: {
    title: "pseolint — SpamBrain-proof your pSEO",
    description: "Audit your programmatic SEO site for SpamBrain risk in 60 seconds.",
    type: "website",
    siteName: "pseolint",
    images: [{
      url: "/opengraph-image",
      width: 1200,
      height: 630,
      alt: "pseolint — SpamBrain-proof your pSEO",
    }],
  },
  twitter: {
    card: "summary_large_image" as const,
    title: "pseolint — SpamBrain-proof your pSEO",
    description: "Audit your programmatic SEO site for SpamBrain risk in 60 seconds.",
    images: [{
      url: "/opengraph-image",
      width: 1200,
      height: 630,
      alt: "pseolint — SpamBrain-proof your pSEO",
    }],
  },
};

/**
 * Escape `</` so a JSON-LD string can't terminate the surrounding <script> early.
 * See https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements
 */
function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, "<\\/");
}

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Ouranos Labs",
  alternateName: "pseolint",
  url: SITE_URL,
  foundingDate: "2026",
  sameAs: ["https://github.com/ouranos-labs/pseolint"],
  employee: {
    "@type": "Person",
    name: "pseolint Editorial Team",
    jobTitle: "Author",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getOptionalSession();
  const plan: "free" | "pro" | null = session ? await getPlan(session.user.id) : null;
  return (
    <html lang="en" className={ cn(GeistSans.variable, GeistMono.variable, displaySerif.variable) }>
      <body className="relative flex h-screen flex-col overflow-hidden bg-background font-sans text-foreground antialiased">
        <SiteNav signedIn={ !!session } email={ session?.user.email } plan={ plan } />
        <main className="relative flex-1 overflow-y-auto">
          <div className="relative">{ children }</div>
          <SiteFooter lastUpdated={ SITE_LAST_UPDATED } />
        </main>
        <script
          type="application/ld+json"
          // Pre-sanitized: JSON.stringify + escape `</` per HTML spec
          dangerouslySetInnerHTML={ { __html: safeJsonLd(ORGANIZATION_JSON_LD) } }
        />
      </body>
    </html>
  );
}

function SiteNav({ signedIn, email, plan }: { signedIn: boolean; email?: string; plan: "free" | "pro" | null }) {
  const navLinkClass = "hidden rounded-[12px] px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground sm:inline-flex";
  return (
    <nav className="relative z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <Link href={ signedIn ? "/dashboard" : "/" } className="flex items-center gap-2.5 text-sm">
          <NavRing size={ 30 } title="pseolint — site-type-aware SpamBrain + AEO audit" />
          <span className="font-semibold tracking-tight">pseolint</span>
          <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">v0.7.0</span>
        </Link>
        <div className="flex items-center gap-1 text-sm">

          <Link href="/tools" className={ navLinkClass }>Tools</Link>
          <Link href="/mcp-server" className={ navLinkClass }>MCP</Link>
          <Link href="/rules" className={ navLinkClass }>Rules</Link>
          <Link href="/methodology" className={ navLinkClass }>Methodology</Link>
          <Link href="/symptoms" className={ navLinkClass }>Symptoms</Link>
          <Link href="/leaderboard" className={ navLinkClass }>Leaderboard</Link>
          { !signedIn && (
            <Link href="/pricing" className={ navLinkClass }>Pricing</Link>
          ) }
          { signedIn && plan === "free" && (
            <Link
              href="/pricing"
              className="ml-1 hidden h-8 items-center rounded-[18px] border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/15 sm:inline-flex"
            >
              Upgrade
            </Link>
          ) }
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
          { signedIn && (
            <Link href="/dashboard" className="ml-2 inline-flex h-8 items-center rounded-[18px] bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90">Dashboard</Link>
          ) }
          { signedIn ? (
            <AccountMenu email={ email ?? "" } plan={ plan ?? "free" } />
          ) : (
            <Link href="/signin" className="ml-2 inline-flex h-8 items-center rounded-[18px] bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90">Sign in</Link>
          ) }
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
      className={ className }
    >
      <path
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

function SiteFooter({ lastUpdated }: { lastUpdated: string }) {
  return (
    <footer className="mt-24 border-t border-border/60">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <NavRing size={ 28 } title="pseolint mark" />
              <span className="text-sm font-semibold tracking-tight text-foreground">pseolint</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              A static analyzer for programmatic SEO. SpamBrain-aware, AEO-aware, OSS-first.
            </p>
          </div>
          <FooterColumn title="Free tools">
            <Link href="/tools/spambrain-checker" className="hover:text-foreground">SpamBrain checker</Link>
            <Link href="/tools/thin-content-scanner" className="hover:text-foreground">Thin content scanner</Link>
            <Link href="/tools/doorway-page-detector" className="hover:text-foreground">Doorway page detector</Link>
            <Link href="/mcp-server" className="hover:text-foreground">MCP server</Link>
            <Link href="/tools" className="hover:text-foreground">All tools →</Link>
          </FooterColumn>
          <FooterColumn title="Learn">
            <Link href="/rules" className="hover:text-foreground">SpamBrain rules</Link>
            <Link href="/symptoms" className="hover:text-foreground">Diagnose symptoms</Link>
            <Link href="/research" className="hover:text-foreground">Research</Link>
            <Link href="/research/state-of-pseo-2026" className="hover:text-foreground">State of pSEO 2026</Link>
            <Link href="/leaderboard" className="hover:text-foreground">Leaderboard</Link>
          </FooterColumn>
          <FooterColumn title="Product">
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="/limits" className="hover:text-foreground">Limits</Link>
            <Link href="/abuse" className="hover:text-foreground">Report abuse</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
          </FooterColumn>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-border/40 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© { new Date().getFullYear() } Ouranos Labs.</p>
          <p className="text-[11px] text-muted-foreground/80">
            Site last updated{ " " }
            <time dateTime={ lastUpdated } className="font-mono">{ lastUpdated }</time>
          </p>
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

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-foreground">{ title }</div>
      <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground">{ children }</div>
    </div>
  );
}
