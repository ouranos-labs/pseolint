import type { Metadata } from "next";
import Link from "next/link";
import { MARKETING_RULES } from "@/lib/marketing-rules";
import { env } from "@/lib/env";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";
const PAGE_URL = `${SITE_URL.replace(/\/$/, "")}/rules`;

export const metadata: Metadata = {
  title: "SpamBrain rules — what pseolint detects · pseolint",
  description:
    "Reference for the 42 rules pseolint runs against programmatic-SEO sites. Five flagship rules are written up here in depth — thin content, doorway pattern, near-duplicate, boilerplate ratio, template diversity.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "SpamBrain rules — what pseolint detects",
    description:
      "Five flagship rule explainers covering thin content, doorway patterns, near-duplicates, boilerplate ratio, and template diversity. The rest of the 42-rule taxonomy is documented in pseolint itself.",
    type: "website",
    url: PAGE_URL,
    siteName: "pseolint"
  },
  twitter: {
    card: "summary_large_image",
    title: "SpamBrain rules — what pseolint detects",
    description:
      "Five flagship rule explainers covering thin content, doorway patterns, near-duplicates, boilerplate ratio, and template diversity."
  }
};

/**
 * Escape `</` sequences inside a JSON-LD payload so a stray closing tag inside
 * a string can't terminate the surrounding `<script>` block. Inputs here are
 * compile-time-static but the escape is cheap and defensive.
 */
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do the pseolint rules map to Google's SpamBrain classifier?",
    a: "The 42 rules cluster into 8 categories that correspond to the major axes SpamBrain scores against. Spam/* (8 rules) covers the patterns that triggered the March 5, 2024 scaled-content-abuse update — thin content under 300 words, doorway clusters, near-duplicate templates with >85% lexical overlap, and templates that don't vary their structural skeleton. Content/* (6 rules) checks intent match, originality, and reading level. Aeo/* (8 rules, shipped April 21, 2026) audits answer-engine readiness for Perplexity, ChatGPT, and Google's AI Overviews.",
  },
  {
    q: "What makes a rule 'AEO-aligned'?",
    a: "The 2022 SpamBrain rebuild changed enforcement — instead of waiting for a manual reviewer, the classifier silently suppresses pages it scores as spam-like at query time. An AEO-aligned rule is one whose detection logic also predicts whether AI Overviews and answer engines will cite the page, because the same signals (entity grounding, citable facts, atomic structure, schema integrity) drive both classical ranking and LLM-powered SERP extraction.",
  },
  {
    q: "Where is the full rule registry documented?",
    a: "Open source at github.com/ouranos-labs/pseolint, and Google's underlying spam policies are documented at developers.google.com/search/docs/essentials/spam-policies. Every rule in pseolint links back to the specific policy paragraph it implements, so you can see exactly which Google guideline a finding maps to.",
  },
  {
    q: "Why are only 5 of the 42 rules written up here?",
    a: "These five spam-pattern rules are the ones most likely to demote a programmatic-SEO domain in 2026, and the ones whose detection logic is least well documented elsewhere. The remaining 37 rules surface in every audit report and are documented inside the open-source repo. More long-form explainers will land here as we observe which generate the most user questions.",
  },
];

interface CollectionPageJsonLd {
  "@context": "https://schema.org";
  "@type": "CollectionPage";
  name: string;
  description: string;
  url: string;
  hasPart: Array<{
    "@type": "TechArticle";
    name: string;
    url: string;
    description: string;
  }>;
}

function buildJsonLd(): CollectionPageJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "SpamBrain rules — what pseolint detects",
    description:
      "Reference for the rules pseolint runs against programmatic-SEO sites, with deep-dive explainers for the five most-impactful spam-pattern detections.",
    url: PAGE_URL,
    hasPart: MARKETING_RULES.map((rule) => ({
      "@type": "TechArticle",
      name: rule.title,
      url: `${SITE_URL.replace(/\/$/, "")}/rules/${rule.slug}`,
      description: rule.metaDescription
    }))
  };
}

export default function RulesIndexPage() {
  const jsonLd = buildJsonLd();

  const faqLd = safeJsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  });

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <script
        type="application/ld+json"
        // JSON-LD payload is built from compile-time-static MARKETING_RULES
        // and passed through safeJsonLd which escapes `<` to neutralise any
        // string that could prematurely close the surrounding script tag.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        // FAQPage payload from compile-time-static FAQS array, escaped via
        // safeJsonLd to prevent script-tag breakout.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: faqLd }}
      />

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Rule reference · 5 of 42 featured
      </div>

      <h1
        className="mt-3 max-w-3xl text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        SpamBrain rules — what pseolint detects.
      </h1>

      <p className="mt-4 max-w-2xl text-base text-muted-foreground">
        pseolint v0.4.0 runs 32 rules across 4 categories — spam-pattern detection
        (8 spam/* rules), AEO/answer-engine readiness (8 aeo/* rules, shipped April
        21, 2026), technical SEO, and structural integrity. Severity weights are
        critical=40, error=25, warning=12, info=5. Each audit completes in a
        60-second free-tier budget (200-page ceiling) or a 90-day rolling
        500-page Pro window. Five of the spam-pattern rules are written up below
        in depth — they are the ones most likely to demote a programmatic-SEO
        domain after the March 5, 2024 scaled-content-abuse update and the
        May 7, 2024 site-reputation-abuse follow-up, and the ones whose
        detection logic (SimHash fingerprinting, Jaccard fallback, BERT-style
        entity grounding) is least well documented elsewhere.
      </p>

      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        These rules cover programmatic-SEO patterns + AI Overview readiness. They don&apos;t
        replace a general SEO audit — for Core Web Vitals use{" "}
        <a href="https://pagespeed.web.dev" className="text-primary hover:underline" rel="nofollow">PageSpeed Insights</a>,
        and for broken-link scanning use{" "}
        <a href="https://sitebulb.com" className="text-primary hover:underline" rel="nofollow">Sitebulb</a>{" "}
        ($35/mo) or{" "}
        <a href="https://screamingfrog.co.uk" className="text-primary hover:underline" rel="nofollow">Screaming Frog</a>{" "}
        ($259/yr).
      </p>

      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Featured deep-dive explainers below; full taxonomy and SpamBrain
        mapping further down.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {MARKETING_RULES.map((rule) => (
          <li key={rule.slug}>
            <Link
              href={`/rules/${rule.slug}`}
              className="group flex h-full flex-col rounded-[22px] border border-border/70 bg-card/60 p-6 backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-card/80"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {rule.ruleId}
                </span>
                <span className="text-xs text-primary transition-transform group-hover:translate-x-0.5">
                  Read &rarr;
                </span>
              </div>
              <h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
                {rule.title.split("—")[0]?.trim() ?? rule.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {rule.oneLiner}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-12 max-w-3xl space-y-5 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          How the rules map to SpamBrain
        </h2>
        <p>
          The 42 rules cluster into 8 categories that correspond to the major
          axes Google&apos;s SpamBrain classifier scores against. Spam/* (8
          rules) covers the patterns that triggered the March 5, 2024
          scaled-content-abuse update — thin content under 300 words, doorway
          clusters with shared boilerplate, near-duplicate templates with
          &gt;85% lexical overlap, and templates that don&apos;t vary their
          structural skeleton across the corpus. Content/* (6 rules) checks
          intent match, originality, and reading level. Aeo/* (8 rules,
          shipped April 21, 2026) audits answer-engine readiness — citable
          facts, atomic Q&amp;A blocks, schema-grounded entities, and the
          things Perplexity, ChatGPT, and Google&apos;s AI Overviews actually
          extract.
        </p>
        <p>
          The remaining categories are links/* (4 rules — anchor concentration,
          paid-link smell, internal link depth, orphan ratio), schema/* (5
          rules — required JSON-LD types, entity grounding, schema-content
          consistency), tech/* (5 rules — Core Web Vitals proxies, render
          stability, robots/canonical hygiene), data/* (3 rules — data-source
          provenance for pSEO, freshness, schema-agnostic recognizers for
          common pSEO patterns like FAQs and regulations), and cannibal/* (3
          rules — keyword cannibalization, intent overlap, and self-referential
          internal-link loops).
        </p>
        <h2 className="pt-2 text-base font-semibold tracking-tight text-foreground">
          What makes a rule &quot;AEO-aligned&quot;
        </h2>
        <p>
          The 2022 SpamBrain rebuild changed what enforcement looks like —
          instead of waiting for a manual reviewer to hit a domain with a
          policy action, the classifier silently suppresses pages it scores as
          spam-like at query time. That means the old &quot;wait for the manual
          action notice&quot; playbook is dead; you have to anticipate the
          scoring. An AEO-aligned rule is one whose detection logic also
          predicts whether AI Overviews and answer engines will cite the page —
          because the same signals (entity grounding, citable facts, atomic
          structure, schema integrity) drive both classical ranking and
          extraction by LLM-powered SERPs.
        </p>
        <p>
          The full rule registry is open source at{" "}
          <a
            href="https://github.com/ouranos-labs/pseolint"
            className="font-medium text-foreground underline decoration-border-strong underline-offset-2 hover:text-primary"
          >
            github.com/ouranos-labs/pseolint
          </a>
          , and Google&apos;s underlying spam policies are documented at{" "}
          <a
            href="https://developers.google.com/search/docs/essentials/spam-policies"
            className="font-medium text-foreground underline decoration-border-strong underline-offset-2 hover:text-primary"
          >
            developers.google.com/search/docs/essentials/spam-policies
          </a>
          . Every rule in pseolint links back to the specific policy paragraph
          it implements, so you can see exactly which Google guideline a
          finding maps to.
        </p>
      </section>

      <section className="mt-14 rounded-[28px] border border-border/70 bg-card/40 p-7 backdrop-blur-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Run all 42 rules on your site
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-foreground">
          The rules above are the ones most likely to fire on a templated site. The
          fastest way to see which ones actually fire on yours is to run a free audit —
          no account required, results in under sixty seconds.
        </p>
        <p className="mt-3 max-w-2xl text-xs text-muted-foreground">
          Each rule ships as an independent ESM module with deterministic
          fingerprinting, configurable thresholds via pseolint.config.ts, and a
          documented severity ladder (info → warning → error → critical) that maps to
          fixed integer penalty weights consumed by the composite-score reducer in
          packages/core/auditor.ts.
        </p>
        <p className="mt-3 max-w-2xl text-[11px] italic text-muted-foreground/70">
          Provenance footnote: ruleId namespaces are stable contract from v0.4
          forward; reintroduced rules retain their identifier or get a
          version-suffixed sibling. Suppression by classification is opt-out
          via --strict.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-[14px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Run a free audit
          </Link>
          <Link
            href="/tools/spambrain-checker"
            className="inline-flex h-11 items-center rounded-[14px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Try the SpamBrain checker
          </Link>
        </div>
      </section>
    </main>
  );
}
