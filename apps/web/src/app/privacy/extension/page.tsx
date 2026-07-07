import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");
const CONTACT_EMAIL = "hello@pseolint.dev";
const EFFECTIVE = "2026-07-07";

export const metadata: Metadata = {
  title: "Extension Privacy Policy · pseolint",
  description:
    "The pseolint Chrome extension collects and transmits no user data. The default landscape needs no permission and makes no network request; deep scan analyzes pages in your browser and discards them. Nothing about you is sent to anyone.",
  alternates: { canonical: `${SITE_URL}/privacy/extension` },
};

export default function ExtensionPrivacy() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Legal · extension privacy
      </div>
      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        Extension Privacy
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        The pseolint browser extension reads as little as possible and sends nothing about you to
        anyone. This page describes exactly what it does, and it matches the code (the extension is
        open source under <code className="font-mono text-foreground">apps/extension</code>). It is
        the privacy policy referenced from the Chrome Web Store listing.
      </p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        Effective {EFFECTIVE} · contact{" "}
        <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </p>

      <Section title="Summary">
        <Item
          k="Data collected"
          v="None. The extension does not collect, transmit, sell, or share any user data. All analysis happens locally in your browser."
        />
        <Item
          k="Network activity"
          v="The automatic landscape makes no network request at all. Deep scan fetches result pages only after you click it, analyzes them in your browser, and discards the content."
        />
        <Item
          k="Tracking"
          v="No analytics, no telemetry, no advertising, no fingerprinting, no cross-site identifiers."
        />
      </Section>

      <Section title="Default landscape (automatic, no permission)">
        <Item
          k="What it reads"
          v="On a Google search results page, the extension reads only what is already on that page: the ranked result URLs, so it can show how programmatic the results are (a small N of M templated chip plus neutral markers on clustered results)."
        />
        <Item
          k="What it does not do"
          v="This runs automatically, makes no network request, asks for no permission, and collects nothing."
        />
      </Section>

      <Section title="Deep scan (only when you ask)">
        <Item
          k="How it starts"
          v="Nothing is fetched until you open the side panel and click Deep scan. That click grants host access for that scan only."
        />
        <Item
          k="How pages are fetched"
          v="The service worker fetches each ranked result page directly from its own site, with no cookies and no session (credentials are omitted)."
        />
        <Item
          k="Where analysis happens"
          v="Each page is analyzed entirely inside your browser for a few SEO signals (title, Open Graph tags, word count, HTTP status, headings). The result becomes a colored badge, and the page content is discarded. It is never stored or sent."
        />
      </Section>

      <Section title="What leaves your browser">
        <Item
          k="To pseolint"
          v="Nothing, unless you click a badge or audit link. That opens pseolint.dev in a new tab, passing as query parameters only public context read from the results page you are on: the clicked result URL, your search query, and the top-ranked competitor's host. It is an ordinary navigation you initiate; pseolint.dev's own privacy policy then applies."
        />
        <Item
          k="To the analyzed sites (deep scan only)"
          v="A normal page request, with no cookies attached."
        />
      </Section>

      <Section title="What it never does">
        <Item k="No tracking" v="No analytics, telemetry, tracking, ads, or fingerprinting." />
        <Item
          k="No personal data"
          v="No collection of browsing history, personal information, form data, or credentials."
        />
        <Item
          k="Local-only storage"
          v="Nothing about your browsing is stored. The only stored value is a domain you optionally type to track your own position, kept locally in the browser and never transmitted."
        />
        <Item
          k="No standing access"
          v="It only ever reads the Google results page you are on, and, on deep scan, the ranked results you ask it to check. It cannot read your email, banking, or any other site, because it never holds standing access to them."
        />
      </Section>

      <Section title="Permissions, and why">
        <Item k="sidePanel" v="Shows the deep-scan results panel." />
        <Item
          k="storage"
          v="Remembers the domain you optionally track. Local only, never sent."
        />
        <Item
          k="activeTab"
          v="Reads the URL of the tab you are actively using, to detect a Google results page and run the analysis on it. Limited to the active tab."
        />
        <Item
          k="Host access to https://www.google.com/search*"
          v="Reads the results page and draws the chip and badges on it. This is the only site the extension has standing access to."
        />
        <Item
          k="Optional host access (https://*/*), requested when you click Deep scan"
          v="Lets the service worker fetch the ranked result pages to analyze them. Granted per scan by you, never held as standing access, and never requested on load."
        />
      </Section>

      <Section title="Contact">
        <Item
          k="Questions"
          v={
            <span>
              Email{" "}
              <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              . Source is open (MIT) at{" "}
              <a
                className="text-primary hover:underline"
                href="https://github.com/ouranos-labs/pseolint"
                rel="noopener"
              >
                github.com/ouranos-labs/pseolint
              </a>{" "}
              under <code className="font-mono text-foreground">apps/extension</code>.
            </span>
          }
        />
      </Section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/extension"
          className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          About the extension
        </Link>
        <Link
          href="/privacy"
          className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Site privacy policy
        </Link>
        <Link
          href="/terms"
          className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Terms of Service
        </Link>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <dl className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
        {children}
      </dl>
    </section>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border/60 px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:gap-6">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="text-sm text-foreground">{v}</dd>
    </div>
  );
}
