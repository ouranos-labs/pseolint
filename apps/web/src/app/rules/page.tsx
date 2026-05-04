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
    "Reference for the SpamBrain + AEO rule set pseolint runs against programmatic-SEO sites. Five flagship rules are written up here in depth — thin content, doorway pattern, near-duplicate, boilerplate ratio, template diversity.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "SpamBrain rules — what pseolint detects",
    description:
      "Five flagship rule explainers covering thin content, doorway patterns, near-duplicates, boilerplate ratio, and template diversity. The rest of the SpamBrain + AEO rule set is documented in pseolint itself.",
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
    a: "The rule set clusters around the major axes SpamBrain scores against. spam/* covers the patterns that triggered the March 5, 2024 scaled-content-abuse update — thin content under 300 words, doorway clusters, near-duplicate templates with >85% lexical overlap, and templates that don't vary their structural skeleton. content/* checks intent match, originality, and reading level. aeo/* audits answer-engine readiness for Perplexity, ChatGPT, and Google's AI Overviews. v0.4.3 added site-type-aware weights so a programmatic-directory is scored differently from a small-marketing site.",
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
    q: "Why are only 5 rules written up here?",
    a: "These five spam-pattern rules are the ones most likely to demote a programmatic-SEO domain in 2026, and the ones whose detection logic is least well documented elsewhere. The rest of the rule set surfaces in every audit report and is documented inside the open-source repo. More long-form explainers will land here as we observe which generate the most user questions.",
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
        Rule reference · 5 of 45 featured
      </div>

      <h1
        className="mt-3 max-w-3xl text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        SpamBrain rules — what pseolint detects.
      </h1>

      <p className="mt-4 max-w-2xl text-base text-muted-foreground">
        pseolint v0.5.2 runs 45 rules across 8 categories — spam-pattern
        detection (8 spam/*), AEO/answer-engine readiness (8 aeo/*), graph
        integrity (6 links/* including host-section-divergence, the May 2024
        site-reputation-abuse detector), technical SEO (9 tech/* including
        og-completeness, new in v0.5.2), content quality (7 content/*
        including title-uniqueness / heading-structure / image-alt-text, all
        new in v0.5.2), structured data (3 schema/*), data-binding consistency
        (2 data/*), and cannibalization (1 cannibal/*).
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
          The rule set clusters around the major axes Google&apos;s SpamBrain
          classifier scores against. Spam/* (8 rules) covers the patterns the
          March 27, 2026 core update demotes most aggressively — the most
          recent classifier shift to hit pSEO, tightening scaled-content
          signals on date-stacked corpora — building on the March 5, 2024
          scaled-content-abuse update that first targeted thin content under
          300 words, doorway clusters with shared boilerplate, near-duplicate
          templates with &gt;85% lexical overlap, templates that don&apos;t
          vary their structural skeleton, and corpus-aware publication-velocity
          (the threshold scales with corpus size in v0.5.1, so a 50,000-page
          directory and a 50-page blog get appropriate cutoffs). Content/*
          (4 rules) checks unique value, meta-description uniqueness after
          entity masking, author signals, and E-E-A-T markers. Aeo/* (8 rules,
          shipped April 21, 2026) audits answer-engine readiness — citable
          facts, atomic Q&amp;A blocks, freshness signals, AI-crawler access,
          and the things Perplexity, ChatGPT, and Google&apos;s AI Overviews
          actually extract.
        </p>
        <p>
          The remaining categories are links/* (6 rules — orphan pages, dead
          ends, cluster connectivity, link depth, unreachable-from-root, and
          host-section-divergence — the last one detects sub-sections that
          ride a host&apos;s reputation without integrating into it, which is
          the May 2024 site-reputation-abuse policy target), tech/* (9 rules —
          canonical consistency, sitemap completeness, soft-404, redirect
          chains, hreflang, robots/noindex conflicts, and robots-compliance
          for sitemap URLs blocked by Disallow), schema/* (3 rules — JSON-LD
          validity, required-fields by type, and cross-page consistency),
          data/* (2 rules — missing-binding and identical-across-pages, fired
          when --data-source is set), and cannibal/* (1 rule — url-pattern;
          title-overlap and keyword-collision were dropped in v0.4 due to
          high false-positive rates).
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
          Run the full rule set on your site
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
