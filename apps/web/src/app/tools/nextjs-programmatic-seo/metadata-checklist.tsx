"use client";

import { useState } from "react";

const CHECKS = [
  {
    id: "title",
    label: "Dynamic <title> per route",
    rule: "content/title-uniqueness",
    critical: true,
    hint: "Use generateMetadata() in Next.js App Router. Ensure each slug produces a title that is unique, not just a swapped entity in a shared template.",
  },
  {
    id: "canonical",
    label: "Self-referencing canonical tag",
    rule: "tech/canonical-consistency",
    critical: true,
    hint: "alternates: { canonical: `${SITE_URL}/${slug}` } inside your generateMetadata return.",
  },
  {
    id: "description",
    label: "Unique meta description on every page",
    rule: "content/meta-uniqueness",
    critical: true,
    hint: "Each page needs its own description built from the record's fields. There is no documented character limit; Google crops snippets to the device width at display time.",
  },
  {
    id: "og",
    label: "OpenGraph title + description + image",
    rule: "aeo/citable-facts",
    critical: false,
    hint: "Set openGraph.title, openGraph.description, and openGraph.images in generateMetadata().",
  },
  {
    id: "schema",
    label: "JSON-LD schema matching page intent",
    rule: "aeo/faq-coverage",
    critical: true,
    hint: "Use FAQPage, HowTo, Article, or Product depending on the page's primary content type.",
  },
  {
    id: "author",
    label: "Author entity in JSON-LD",
    rule: "content/missing-author",
    critical: false,
    hint: 'Add "author": { "@type": "Person", "name": "...", "knowsAbout": [...] } inside your Article/TechArticle schema.',
  },
  {
    id: "datePublished",
    label: "datePublished + dateModified in schema",
    rule: "aeo/freshness-signals",
    critical: false,
    hint: "Include both datePublished and dateModified in your JSON-LD. Update dateModified programmatically when content changes.",
  },
  {
    id: "hreflang",
    label: "hreflang tags (if multilingual)",
    rule: "content/translation-no-op",
    critical: false,
    hint: "Only add hreflang if pages are actually translated. Fake locale folders score as thin content.",
  },
  {
    id: "breadcrumb",
    label: "BreadcrumbList schema",
    rule: "links/link-depth",
    critical: false,
    hint: "Add a BreadcrumbList JSON-LD with each path segment so Google can display site hierarchy in the SERP.",
  },
  {
    id: "robots",
    label: "No accidental noindex on production routes",
    rule: "tech/robots-noindex-conflict",
    critical: true,
    hint: "Check next.config.ts and your generateMetadata for robots: { index: false }. Staging configs leak into production.",
  },
];

export function MetadataChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const passed = Object.values(checked).filter(Boolean).length;
  const criticalTotal = CHECKS.filter((c) => c.critical).length;
  const criticalPassed = CHECKS.filter((c) => c.critical && checked[c.id]).length;

  const score = Math.round((passed / CHECKS.length) * 100);
  const scoreColor =
    score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-destructive";

  return (
    <div className="rounded-[22px] border border-border/70 bg-card/60 p-6 backdrop-blur-sm shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Metadata Compliance Checker
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Check each metadata field your template implements.
          </p>
        </div>
        <div className="text-right">
          <span className={`font-mono text-3xl font-bold tabular-nums ${scoreColor}`}>
            {score}%
          </span>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {criticalPassed}/{criticalTotal} critical
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6 h-1.5 w-full rounded-full bg-border/50 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Checklist */}
      <ul className="space-y-2">
        {CHECKS.map((check) => (
          <li key={check.id}>
            <label
              htmlFor={`check-${check.id}`}
              className={`flex items-start gap-3 cursor-pointer rounded-xl p-3 transition-colors ${
                checked[check.id]
                  ? "bg-primary/5 border border-primary/20"
                  : "hover:bg-muted/40 border border-transparent"
              }`}
            >
              <input
                id={`check-${check.id}`}
                type="checkbox"
                checked={!!checked[check.id]}
                onChange={() => toggle(check.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">
                    {check.label}
                  </span>
                  {check.critical && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-destructive border border-destructive/30 bg-destructive/10 px-1.5 py-px rounded-full">
                      Critical
                    </span>
                  )}
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {check.rule}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                  {check.hint}
                </p>
              </div>
            </label>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div className="mt-6 pt-5 border-t border-border/40 text-center">
        <p className="text-xs text-muted-foreground">
          Run a live audit to verify these fields are correctly rendering in production.
        </p>
        <a
          href="/"
          className="mt-3 inline-flex h-9 items-center rounded-[12px] bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Scan a live URL →
        </a>
      </div>
    </div>
  );
}
