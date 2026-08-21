"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "pseo-checklist-v1";

const ITEMS = [
  {
    id: "data-uniqueness",
    category: "Data & Content",
    title: "Every page has ≥300 words of unique body copy",
    detail: "Strip nav, header, footer, and sidebars. Remaining text must be ≥300 words and not repeated on sibling pages.",
    severity: "Critical",
    ruleSlug: "thin-content",
  },
  {
    id: "entity-data",
    category: "Data & Content",
    title: "Pages use real entity data (not just swapped nouns)",
    detail: "Inject local API data, real prices, named practitioners, or custom statistics. City-swap alone triggers doorway-page detection.",
    severity: "Critical",
    ruleSlug: "doorway-pattern",
  },
  {
    id: "boilerplate",
    category: "Data & Content",
    title: "Boilerplate text is under 60% of total word count",
    detail: "Shared nav, CTAs, and footers should not dominate the page. Measure boilerplate ratio with pseolint's boilerplate-ratio rule.",
    severity: "Critical",
    ruleSlug: "boilerplate-ratio",
  },
  {
    id: "canonical",
    category: "Technical SEO",
    title: "Every page has a self-referencing canonical tag",
    detail: "rel=canonical must point to the exact URL of each page. Do not canonicalize to parent categories or the homepage.",
    severity: "Critical",
    ruleSlug: "thin-content",
  },
  {
    id: "noindex-check",
    category: "Technical SEO",
    title: "No accidental noindex on production pages",
    detail: "Verify that staging-only noindex directives are not leaking into production via CDN caching or environment variable bugs.",
    severity: "Critical",
    ruleSlug: "thin-content",
  },
  {
    id: "sitemap",
    category: "Technical SEO",
    title: "Sitemap only declares indexable, live pages",
    detail: "Remove thin, deindexed, or noindexed pages from your sitemap. A 20% indexed/declared ratio tanks sitemap trust.",
    severity: "Major",
    ruleSlug: "thin-content",
  },
  {
    id: "internal-links",
    category: "Technical SEO",
    title: "No orphan pages: all URLs have ≥1 internal inbound link",
    detail: "Google discovers pages through links. Pages only reachable via sitemap are fragile. Add hub or category pages that link into your templates.",
    severity: "Major",
    ruleSlug: "orphan-pages",
  },
  {
    id: "schema",
    category: "Structured Data",
    title: "JSON-LD schema matching page intent is present",
    detail: "Use FAQPage, HowTo, Article, Product, or BreadcrumbList depending on the template's primary content type.",
    severity: "Major",
    ruleSlug: "faq-coverage",
  },
  {
    id: "author",
    category: "Structured Data",
    title: "Author entity is declared in schema or byline",
    detail: "Add an author Person node in JSON-LD with name, jobTitle, and knowsAbout. Anonymous AI-generated pages are deprioritized by AI Overviews.",
    severity: "Optimization",
    ruleSlug: "missing-author",
  },
  {
    id: "title-unique",
    category: "Metadata",
    title: "Each page has its own specific title",
    detail: "Google documents no title-length limit, and SERP cropping is display-side. The real risk at template scale: entity-swap title templates that produce identical or near-identical titles across sibling pages, which trigger canonicalization merges.",
    severity: "Critical",
    ruleSlug: "title-uniqueness",
  },
  {
    id: "description",
    category: "Metadata",
    title: "Meta description is present and unique per page",
    detail: "Google documents no length limit; snippets are cropped to the device width. Generic or duplicated descriptions get overridden by Google, and a missing one hands the snippet to its rewriter. Build each from the record's own fields.",
    severity: "Major",
    ruleSlug: "meta-uniqueness",
  },
  {
    id: "freshness",
    category: "Metadata",
    title: "datePublished and dateModified are declared in schema",
    detail: "Include both in your JSON-LD Article or WebPage schema. Update dateModified programmatically when templates change. Stale dates suppress AI Overview citations.",
    severity: "Optimization",
    ruleSlug: "freshness-signals",
  },
];

const CATEGORIES = [...new Set(ITEMS.map((i) => i.category))];

const SEVERITY_COLOR: Record<string, string> = {
  Critical: "text-destructive border-destructive/40 bg-destructive/10",
  Major: "text-warning border-warning/40 bg-warning/10",
  Optimization: "text-primary border-primary/40 bg-primary/10",
};

export function InteractiveChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setChecked(JSON.parse(stored) as Record<string, boolean>);
    } catch {
      // ignore parse errors
    }
  }, []);

  const toggle = (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const total = ITEMS.length;
  const done = Object.values(checked).filter(Boolean).length;
  const pct = mounted ? Math.round((done / total) * 100) : 0;
  const scoreColor =
    pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-destructive";

  const reset = () => {
    setChecked({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-[22px] border border-border/70 bg-card/60 p-6 backdrop-blur-sm shadow-xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pre-launch Checklist
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Progress is saved in your browser automatically.
          </p>
        </div>
        <div className="text-right shrink-0">
          {mounted ? (
            <>
              <span className={`font-mono text-3xl font-bold tabular-nums ${scoreColor}`}>
                {pct}%
              </span>
              <p className="text-[10px] text-muted-foreground">{done}/{total} done</p>
            </>
          ) : (
            <span className="font-mono text-3xl font-bold tabular-nums text-muted-foreground">: </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6 h-1.5 w-full rounded-full bg-border/50 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: mounted ? `${pct}%` : "0%" }}
        />
      </div>

      {/* Items grouped by category */}
      {CATEGORIES.map((cat) => (
        <div key={cat} className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 pl-1">
            {cat}
          </p>
          <ul className="space-y-1">
            {ITEMS.filter((i) => i.category === cat).map((item) => (
              <li key={item.id} className="rounded-xl border border-transparent hover:border-border/60 transition-colors">
                <div className="flex items-start gap-3 p-3">
                  <input
                    id={`cl-${item.id}`}
                    type="checkbox"
                    checked={!!checked[item.id]}
                    onChange={() => toggle(item.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label
                        htmlFor={`cl-${item.id}`}
                        className={`text-xs font-semibold cursor-pointer ${checked[item.id] ? "line-through text-muted-foreground" : "text-foreground"}`}
                      >
                        {item.title}
                      </label>
                      <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-px rounded-full border ${SEVERITY_COLOR[item.severity]}`}>
                        {item.severity}
                      </span>
                    </div>
                    {expanded[item.id] && (
                      <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                        {item.detail}
                        {item.ruleSlug && (
                          <>
                            {" "}
                            <a
                              href={`/rules/${item.ruleSlug}`}
                              className="text-primary hover:underline"
                            >
                              Learn more →
                            </a>
                          </>
                        )}
                      </p>
                    )}
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="text-[10px] text-muted-foreground hover:text-foreground mt-0.5 transition-colors"
                    >
                      {expanded[item.id] ? "Hide" : "Why?"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={reset}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Reset progress
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex h-8 items-center rounded-[10px] border border-border px-3 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            Print / Save PDF
          </button>
          <a
            href="/"
            className="inline-flex h-8 items-center rounded-[10px] bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Run live audit →
          </a>
        </div>
      </div>
    </div>
  );
}
