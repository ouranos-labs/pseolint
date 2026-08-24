"use client";

import { useState } from "react";

const SCHEMAS = [
  {
    type: "Article / TechArticle",
    intent: "Blog posts, developer guides, research reports",
    rule: "content/missing-author",
    snippet: `{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "How to Implement JSON-LD at Scale",
  "datePublished": "2026-06-19",
  "dateModified": "2026-06-19",
  "author": {
    "@type": "Person",
    "name": "Your Name",
    "jobTitle": "Lead SEO Engineer",
    "knowsAbout": ["SEO", "TypeScript", "Next.js"]
  },
  "publisher": {
    "@type": "Organization",
    "name": "Ouranos Labs",
    "url": "https://pseolint.dev"
  },
  "inLanguage": "en"
}`,
    tips: [
      "Use TechArticle for code-heavy developer guides; it signals technical authority to AI systems.",
      "Always include both datePublished and dateModified. Stale dates suppress AI Overview citations.",
      "The knowsAbout array is the machine-readable equivalent of an author bio: be specific.",
    ],
  },
  {
    type: "Product",
    intent: "Tool pages, SaaS landing pages, comparison pages",
    rule: "aeo/faq-coverage",
    snippet: `{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "pseolint Pre-flight Audit Suite",
  "description": "Template-aware SpamBrain linter for programmatic SEO.",
  "url": "https://pseolint.dev",
  "brand": {
    "@type": "Brand",
    "name": "pseolint"
  },
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  }
}`,
    tips: [
      "Set price to 0 with availability InStock to qualify for free product rich results in SERP.",
      "Use AggregateRating only if you have real, verifiable reviews: fake reviews are a manual action risk.",
      "Combine with BreadcrumbList and an Article node on the same page for a complete entity graph. Do not reach for FAQPage or HowTo: Google retired both rich results (HowTo in September 2023, FAQ on May 7, 2026).",
    ],
  },
  {
    type: "BreadcrumbList",
    intent: "All multi-level pages (rules, tools, research)",
    rule: "links/link-depth",
    snippet: `{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://pseolint.dev"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Rules",
      "item": "https://pseolint.dev/rules"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Structured Data at Scale",
      "item": "https://pseolint.dev/rules/structured-data-at-scale"
    }
  ]
}`,
    tips: [
      "BreadcrumbList should match the visual breadcrumb nav on the page exactly.",
      "The last item's item URL must match the page's self-referencing canonical.",
      "Every programmatic page template should include this; it gives Google your site hierarchy in machine-readable form.",
    ],
  },
];

export function SchemaExplorer() {
  const [active, setActive] = useState(0);
  const schema = SCHEMAS[active];

  return (
    <div className="rounded-[22px] border border-border/70 bg-card/60 p-6 backdrop-blur-sm shadow-xl">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Schema Type Explorer
      </h3>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border/60 pb-4 mb-6">
        {SCHEMAS.map((s, idx) => (
          <button
            key={s.type}
            onClick={() => setActive(idx)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              active === idx
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {s.type}
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: intent + tips */}
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Use for
            </p>
            <p className="text-sm text-foreground">{schema.intent}</p>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Implementation tips
            </p>
            <ul className="space-y-2">
              {schema.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-primary/15 text-primary text-[9px] flex items-center justify-center font-bold">
                    {i + 1}
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          <a
            href={`/rules/${schema.rule}`}
            className="inline-flex items-center text-xs text-primary hover:underline"
          >
            pseolint rule: <code className="ml-1 font-mono">{schema.rule}</code> →
          </a>
        </div>

        {/* Right: code snippet */}
        <div className="rounded-xl border border-border/60 bg-background/60 p-4 overflow-x-auto">
          <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              JSON-LD Template
            </span>
            <span className="text-[10px] text-primary font-semibold">{schema.type}</span>
          </div>
          <pre className="font-mono text-[10px] leading-relaxed text-foreground/85 whitespace-pre">
            <code>{schema.snippet}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
