import "./globals.css";
import { GeistSans, GeistMono } from "geist/font";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { getOptionalSession } from "@/lib/session";

export const metadata = {
  title: "pseolint — SpamBrain-proof your pSEO",
  description: "Audit your programmatic SEO site for SpamBrain risk in 60 seconds.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getOptionalSession();
  const signedIn = !!session;

  return (
    <html lang="en" className={cn(GeistSans.variable, GeistMono.variable)}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <nav className="border-b">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <Link href="/" className="font-semibold tracking-tight">pseolint</Link>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              {signedIn && (
                <>
                  <Link href="/dashboard/queue" className="rounded-[12px] px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground">Queue</Link>
                  <Link href="/dashboard/integrations" className="rounded-[12px] px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground">Integrations</Link>
                </>
              )}
              <Link href="/leaderboard" className="hover:text-foreground">Leaderboard</Link>
              <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
              <Link href="/signin" className="hover:text-foreground">Sign in</Link>
            </div>
          </div>
        </nav>
        <div>{children}</div>
        <footer className="mt-20 border-t">
          <div className="container mx-auto flex gap-6 px-4 py-6 text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <a href="https://github.com/ouranos-labs/pseolint" className="hover:text-foreground">GitHub</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
