import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Report abuse · pseolint",
  description:
    "How to stop pseolint from auditing your site, and how to report harassment via repeated audits. Robots.txt opt-out, host blocklist, abuse contact.",
  alternates: { canonical: `${SITE_URL}/abuse` },
  robots: { index: true, follow: true },
};

const ABUSE_EMAIL = "abuse@pseolint.dev";
const ABUSE_MAILTO_TEMPLATE = `mailto:${ABUSE_EMAIL}?subject=${encodeURIComponent("Abuse report: stop auditing example.com")}&body=${encodeURIComponent(
  `Domain to add to blocklist:\n  example.com\n\nWhy (optional):\n  My site is being repeatedly audited by pseolint. I do not consent to this and request the domain be added to your block list.\n\nProof of ownership (one of):\n  - DNS TXT record: pseolint-abuse=<token from email reply>\n  - Email from a @example.com address\n  - WHOIS contact match\n\nThanks.\n`,
)}`;

export default function AbusePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <h1
        className="text-balance text-3xl tracking-tight sm:text-4xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        Stop pseolint from auditing your site
      </h1>
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
        pseolint lets anyone audit any public URL. That&apos;s the OSS-first product. If your site
        is being audited and you want it to stop, you have two paths — one you control directly,
        one we control on request.
      </p>

      <Section title="Self-serve: robots.txt opt-out">
        <p>
          Our crawler honours <code className="font-mono text-foreground">robots.txt</code>{" "}
          (Disallow paths AND Crawl-delay) and identifies itself with the user-agent token{" "}
          <code className="font-mono text-foreground">pseolint</code>. Add these two lines to{" "}
          <code className="font-mono text-foreground">https://yourdomain.example/robots.txt</code>{" "}
          and the next audit attempt will fetch zero pages from your site:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-[14px] border border-border/60 bg-card/40 p-4 text-xs leading-relaxed text-foreground">
          {`User-agent: pseolint\nDisallow: /`}
        </pre>
        <p className="mt-3 text-xs text-muted-foreground">
          The full UA string we send is{" "}
          <code className="font-mono">Mozilla/5.0 (compatible; pseolint/0.5.1; +{SITE_URL}/bot)</code>.
          You can also block at your CDN/WAF by matching that token.
        </p>
      </Section>

      <Section title="Server-side: blocklist by request">
        <p>
          If you can&apos;t edit <code className="font-mono text-foreground">robots.txt</code>{" "}
          (third-party host, no access, etc.) or you want a hard block at our edge, email{" "}
          <a className="text-primary hover:underline" href={`mailto:${ABUSE_EMAIL}`}>
            {ABUSE_EMAIL}
          </a>{" "}
          and we&apos;ll add the domain to our host blocklist. After that, any audit request for
          your domain returns a 403 before we touch the network.
        </p>
        <p className="mt-3">
          We need to verify ownership before adding the block (otherwise this becomes its own
          harassment vector). One of:
        </p>
        <ul className="mt-2 ml-5 list-disc space-y-1 text-sm">
          <li>
            DNS TXT record we&apos;ll give you in the reply (e.g.{" "}
            <code className="font-mono text-xs">pseolint-abuse=&lt;token&gt;</code>)
          </li>
          <li>An email reply from an address on the affected domain</li>
          <li>Public WHOIS contact match</li>
        </ul>
        <div className="mt-4">
          <a
            href={ABUSE_MAILTO_TEMPLATE}
            className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Email {ABUSE_EMAIL} →
          </a>
        </div>
      </Section>

      <Section title="What we already do to limit damage">
        <ul className="ml-5 list-disc space-y-1 text-sm">
          <li>Per-host hourly cap of 30 fresh audits (across all users)</li>
          <li>Per-user daily cap of 15 audits against any single host (Pro) / 3 (free) / 1 (anon)</li>
          <li>Per-anon-IP daily cap of 1 audit against any single host</li>
          <li>1-hour URL-level dedup — repeat audits return cached results, no re-crawl</li>
          <li>Honour <code className="font-mono text-foreground">robots.txt</code>, <code className="font-mono text-foreground">Crawl-delay</code>, and <code className="font-mono text-foreground">Retry-After</code></li>
          <li>Max 5 parallel fetches per audit, 50 MB per audit, 200 pages per audit</li>
          <li>SSRF guard rejects private/internal addresses</li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Full operational details at{" "}
          <Link className="text-primary hover:underline" href="/limits">
            /limits
          </Link>
          .
        </p>
      </Section>

      <Section title="Other concerns">
        <p>
          Bug reports, security issues, or anything that doesn&apos;t fit above:{" "}
          <a className="text-primary hover:underline" href="mailto:hello@pseolint.dev">
            hello@pseolint.dev
          </a>
          . For security issues affecting users of the hosted product, please use a subject line
          starting with <code className="font-mono text-xs">[security]</code> so we can triage faster.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}
