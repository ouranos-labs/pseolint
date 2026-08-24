import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

// Set to the Chrome Web Store listing URL once the extension is published. While
// empty, the page shows a "coming soon" state instead of a dead Add-to-Chrome link.
const STORE_URL = "https://chromewebstore.google.com/detail/kinebehnhjjklmnpcjngfhkglbnochjb";
const GITHUB_URL = "https://github.com/ouranos-labs/pseolint/tree/main/apps/extension";

export const metadata: Metadata = {
  title: "pseolint for Chrome: audit any Google SERP for programmatic-SEO risk",
  description:
    "A free, open-source Chrome extension that audits any Google search results page for programmatic-SEO risk: templated and doorway pages, thin content, soft 404s, and AI Overview citation gaps. No account, nothing about you is sent.",
  alternates: { canonical: `${SITE_URL}/extension` },
  openGraph: {
    title: "pseolint for Chrome: programmatic-SEO risk, on the SERP",
    description:
      "See how templated a results page is, who's beatable, the content bar to clear, and who's AI-Overview-ready. Free, on the page you're already looking at.",
    url: `${SITE_URL}/extension`,
    type: "website",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "pseolint for Chrome",
    description:
      "Audit any Google SERP for programmatic-SEO risk: templated pages, thin content, soft 404s, AI Overview gaps. Free.",
  },
};

function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "What does the pseolint extension do?",
    a: "On any Google search results page it shows how templated the results are (how many are near-identical, across how many hosts) with no permission and no network request. When you open the side panel and run Deep scan, it fetches the ranked results, analyzes each one in your browser, and turns the SERP into a competitive scorecard: a strategic takeaway, the content bar you'd need to clear, the weakest page that still ranks, and per-result risk flags (thin, soft 404, no schema, and more).",
  },
  {
    q: "Is it free? Does it need an account?",
    a: "It is free and open source (MIT), and it needs no account. The default landscape works with zero permissions. Deep scan asks for host access only at the moment you click it, per scan.",
  },
  {
    q: "What data does it collect?",
    a: "None. The default landscape makes no network request. Deep scan analyzes pages in your browser and discards the content immediately, with no cookies and no session attached. Nothing about you is collected, transmitted, or sold. The only value it ever stores is a domain you optionally type to track your position, kept locally and never sent. Full detail on the extension privacy page.",
  },
  {
    q: "Does it work on any Google search?",
    a: "It runs on the Web (All) results tab. On Images, News, Shopping, and other verticals it stays dormant, because those results are not the web pages it audits.",
  },
  {
    q: "How is it different from other SEO extensions?",
    a: "Most SEO extensions grade a single page. pseolint reads the whole results page as a competitive field: how programmatic it is, which competitors are thin or templated, and the single weakest page you can realistically outrank. It surfaces the same failure signals that get programmatic and doorway sites suppressed, on the live SERP.",
  },
  {
    q: "Where do I get it?",
    a: STORE_URL
      ? "Install it from the Chrome Web Store using the Add to Chrome button on this page, or build it from source on GitHub."
      : "It is being published to the Chrome Web Store. In the meantime you can build it from source on GitHub (apps/extension). This page will link the store listing as soon as it is live.",
  },
];

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "pseolint: Programmatic SEO & SERP Auditor",
  applicationCategory: "BrowserApplication",
  operatingSystem: "Chrome",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  url: `${SITE_URL}/extension`,
};

const DETECTS: [string, string][] = [
  ["Programmatic & doorway pages", "near-identical results templated across many URLs"],
  ["Thin content", "pages with too little substance to deserve their ranking"],
  ["Soft 404s", "error pages that return HTTP 200 and get indexed as junk"],
  ["Missing metadata", "no meta description, no Open Graph tags, no structured data"],
  ["AI Overview & AEO gaps", "results not structured for citation in AI answers"],
];

export default function ExtensionPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(softwareJsonLd) }} />

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Chrome extension · free & open source
      </div>
      <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
        Audit any Google SERP for programmatic-SEO risk.
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        pseolint for Chrome reads the results page you are already looking at: how templated the
        results are, which competitors are thin or low quality, the content bar you would need to
        clear, and which pages are eligible for citation in AI Overviews. Free, with no account, and
        nothing about you is sent.
      </p>

      {/* CTA */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {STORE_URL ? (
          <a
            href={STORE_URL}
            rel="noopener"
            className="inline-flex h-11 items-center rounded-[16px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Add to Chrome, free
          </a>
        ) : (
          <span className="inline-flex h-11 items-center rounded-[16px] border border-primary/40 bg-primary/10 px-5 text-sm font-semibold text-primary">
            Coming soon to the Chrome Web Store
          </span>
        )}
        <a
          href={GITHUB_URL}
          rel="noopener"
          className="inline-flex h-11 items-center rounded-[16px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          View source
        </a>
      </div>

      {/* Visual: a results card with real-style badges */}
      <div className="mt-8 overflow-hidden rounded-[22px] border border-border/60 bg-card/40 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          On the SERP, after a deep scan
        </p>
        <ExampleRow url="authority-guide.com › crm › best" title="The 12 Best CRMs for Small Business" />
        <ExampleRow url="listings.example › austin-tx › crm" title="Best CRM Software in Austin, TX" badge="templated" tone="templated" />
        <ExampleRow url="listings.example › dallas-tx › crm" title="CRM Software in Dallas, TX" badge="no OG tags" tone="warn" />
        <ExampleRow url="cheap-directory.co › tools › crm" title="Cheap CRM Directory, 100+ Tools" badge="3 flags" tone="flag" />
        <div className="mt-3 inline-flex items-center gap-2 rounded-[10px] border border-border/70 bg-background/70 px-3 py-2 text-xs text-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          pseolint · 6/10 templated · 3 hosts
        </div>
      </div>

      {/* How it works */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[22px] border border-border/60 bg-card/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-success">
            Automatic · zero permission
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">The landscape</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The moment you land on a results page, pseolint shows how templated the field is and
            across how many hosts. It reads only what is already on the page. No permission prompt,
            nothing fetched.
          </p>
        </div>
        <div className="rounded-[22px] border border-border/60 bg-card/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Opt-in · one click
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">Deep scan</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Open the side panel and click Deep scan. pseolint fetches the ranked results, analyzes
            each in your browser, and returns a competitive scorecard: the takeaway, the content bar,
            the opening, and per-result risk flags.
          </p>
        </div>
      </section>

      {/* What it detects */}
      <section className="mt-6 rounded-[22px] border border-border/60 bg-card/40 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
          What it detects
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground">
          {DETECTS.map(([k, v]) => (
            <li key={k} className="flex gap-2">
              <span className="mt-0.5 text-primary">›</span>
              <span>
                <span className="font-medium">{k}:</span>{" "}
                <span className="text-muted-foreground">{v}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Privacy */}
      <section className="mt-6 rounded-[22px] border border-primary/25 bg-primary/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Privacy first</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          The default landscape needs no permission and makes no network request. Deep scan analyzes
          pages in your browser, discards the content immediately, and attaches no cookies. Nothing
          about you is collected, transmitted, or sold. The rule logic is the same open-source engine
          (MIT) behind the pseolint CLI and GitHub Action, with zero runtime dependencies.
        </p>
        <Link
          href="/privacy/extension"
          className="mt-3 inline-flex text-sm font-medium text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80"
        >
          Read the extension privacy policy
        </Link>
      </section>

      {/* Funnel */}
      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        The extension is recon: it finds where a SERP is winnable. The full teardown, and continuous
        monitoring of your whole site grounded in Search Console, lives in the{" "}
        <Link href="/" className="text-foreground underline decoration-dotted underline-offset-2">
          pseolint web app
        </Link>
        .
      </p>

      {/* FAQ */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Frequently asked</h2>
        <dl className="mt-4 space-y-5">
          {FAQS.map((f) => (
            <div key={f.q} className="rounded-[18px] border border-border/50 bg-card/30 p-4">
              <dt className="text-sm font-medium text-foreground">{f.q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-10 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        pseolint for Chrome is a free, open-source browser extension for programmatic-SEO auditing.
        It analyzes the live Google search results page to detect templated and doorway pages, thin
        content, soft 404s, missing structured data, and AI Overview citation gaps, so you can see
        how programmatic a results page is and where it is winnable, without leaving Google.
      </p>
    </main>
  );
}

function ExampleRow({
  url,
  title,
  badge,
  tone,
}: {
  url: string;
  title: string;
  badge?: string;
  tone?: "templated" | "warn" | "flag";
}) {
  const bg = tone === "flag" ? "#df3a3a" : tone === "warn" ? "#fbb337" : "#586474";
  const fg = tone === "warn" ? "#3a2a06" : "#ffffff";
  return (
    <div className="border-t border-border/50 py-2.5 first:border-t-0">
      <div className="text-xs text-muted-foreground">{url}</div>
      <div className="mt-0.5 text-sm text-foreground">
        <span className="text-[#5b8cff]">{title}</span>
        {badge ? (
          <span
            className="ml-2 inline-flex items-center rounded-[7px] px-1.5 py-px align-middle font-mono text-[10px] font-semibold"
            style={{ background: bg, color: fg }}
          >
            {badge} ↗
          </span>
        ) : null}
      </div>
    </div>
  );
}
