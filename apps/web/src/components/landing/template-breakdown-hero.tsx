import type { Template } from "@pseolint/core";
import { TemplateCard } from "@/components/audit/template-card";

/**
 * Audit-as-template visual centerpiece: shows the paradigm with 3 live
 * TemplateCard instances backed by realistic mock data. No interactivity:
 * this is a static marketing surface. The annotation and comparison footer
 * explain the aggregation logic (spec §15.1) and the v0.5→stratified sampling shift.
 */

const TOTAL_DISCOVERED = 8432; // sum of the three mock templates

const MOCK_TEMPLATES: Template[] = [
  {
    signature: "/listing/:slug",
    totalUrls: 8201,
    totalDiscoveredUrls: TOTAL_DISCOVERED,
    auditedUrls: [
      "https://example.com/listing/new-york-accountants",
      "https://example.com/listing/los-angeles-attorneys",
      "https://example.com/listing/chicago-dentists",
      "https://example.com/listing/houston-plumbers",
      "https://example.com/listing/phoenix-electricians",
      "https://example.com/listing/dallas-landscapers",
      "https://example.com/listing/san-antonio-roofers",
      "https://example.com/listing/san-diego-painters",
      "https://example.com/listing/philadelphia-cleaners",
      "https://example.com/listing/san-jose-mechanics",
    ],
    verdict: "concerning",
    risk: 60,
    categories: {
      integrity:      { grade: "D", issues: 8 },
      discoverability:{ grade: "C", issues: 3 },
      citation:       { grade: "C", issues: 2 },
      data:           { grade: "D", issues: 5 },
      audit:          { grade: "B", issues: 1 },
    },
    variance: {
      ruleFireRates: {
        "spam/thin-content": 0.8,
        "spam/boilerplate-ratio": 0.6,
        "aeo/citable-facts": 0.3,
      },
      uniformityScore: 0.85,
      topDriver: { ruleId: "spam/thin-content", fireRate: 0.8 },
    },
    findingIds: [],
  },
  {
    signature: "/category/:slug",
    totalUrls: 142,
    totalDiscoveredUrls: TOTAL_DISCOVERED,
    auditedUrls: [
      "https://example.com/category/accountants",
      "https://example.com/category/attorneys",
      "https://example.com/category/dentists",
      "https://example.com/category/plumbers",
      "https://example.com/category/electricians",
      "https://example.com/category/landscapers",
      "https://example.com/category/roofers",
      "https://example.com/category/painters",
      "https://example.com/category/cleaners",
      "https://example.com/category/mechanics",
    ],
    verdict: "caution",
    risk: 30,
    categories: {
      integrity:      { grade: "B", issues: 2 },
      discoverability:{ grade: "A", issues: 0 },
      citation:       { grade: "C", issues: 4 },
      data:           { grade: "B", issues: 1 },
      audit:          { grade: "A", issues: 0 },
    },
    variance: {
      ruleFireRates: {
        "aeo/citable-facts": 0.5,
        "spam/thin-content": 0.1,
      },
      uniformityScore: 0.6,
      topDriver: { ruleId: "aeo/citable-facts", fireRate: 0.5 },
    },
    findingIds: [],
  },
  {
    signature: "/article/:slug",
    totalUrls: 89,
    totalDiscoveredUrls: TOTAL_DISCOVERED,
    auditedUrls: [
      "https://example.com/article/how-to-hire-accountants",
      "https://example.com/article/vetting-local-attorneys",
      "https://example.com/article/finding-dentists-guide",
      "https://example.com/article/emergency-plumber-tips",
      "https://example.com/article/electrical-safety-basics",
      "https://example.com/article/landscaping-cost-guide",
      "https://example.com/article/roof-inspection-checklist",
      "https://example.com/article/interior-painting-faq",
      "https://example.com/article/house-cleaning-frequency",
      "https://example.com/article/car-maintenance-schedule",
    ],
    verdict: "ready",
    risk: 12,
    categories: {
      integrity:      { grade: "A", issues: 0 },
      discoverability:{ grade: "A", issues: 1 },
      citation:       { grade: "B", issues: 2 },
      data:           { grade: "A", issues: 0 },
      audit:          { grade: "A", issues: 0 },
    },
    variance: {
      ruleFireRates: {
        "aeo/freshness-signals": 0.2,
        "aeo/citable-facts": 0.1,
      },
      uniformityScore: 0.91,
      topDriver: { ruleId: "aeo/freshness-signals", fireRate: 0.2 },
    },
    findingIds: [],
  },
];

export function TemplateBreakdownHero() {
  return (
    <section className="border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">

        {/* Heading */}
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Audit-as-template
        </div>
        <h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          pseolint audits your site by template.{" "}
          <span
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
          >
            Here&apos;s what that looks like.
          </span>
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Pinpoint which template is broken. Fix one template, fix{" "}
          <em>N</em> pages.
        </p>

        {/* 3-card grid */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MOCK_TEMPLATES.map((t) => (
            <TemplateCard
              key={t.signature}
              template={t}
              totalDiscoveredUrls={TOTAL_DISCOVERED}
            />
          ))}
        </div>

        {/* Annotation callout */}
        <div className="mt-6 flex gap-3 rounded-[18px] border border-warning/30 bg-warning/5 px-5 py-4">
          <span className="mt-0.5 flex-shrink-0 font-mono text-xs text-warning">
            &#8629;
          </span>
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">
              This is the site verdict.
            </span>{" "}
            <code className="font-mono text-[11px]">siteVerdictFromTemplates</code>{" "}
            picks the worst template with{" "}
            <strong className="text-foreground">≥5% URL coverage.</strong>{" "}
            <code className="font-mono text-[11px]">/listing/:slug</code> covers{" "}
            97.3% of the site, so its{" "}
            <span className="font-semibold text-warning">concerning</span> verdict drives
            the headline, even though <code className="font-mono text-[11px]">/article/:slug</code>{" "}
            is clean. One template-level fix, not 8,201 page-by-page investigations.
          </p>
        </div>

        {/* v0.5 (flat) vs current (stratified) comparison footer */}
        <div className="mt-6 overflow-hidden rounded-[18px] border border-border/60 bg-card/40">
          <div className="flex items-center border-b border-border/60 px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Sampling model: before &amp; after
            </p>
          </div>
          <div className="grid gap-0 divide-y divide-border/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="px-5 py-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                v0.5: flat random sample
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                200 URLs drawn across the whole site. On an 8,200-URL directory,
                0.2% coverage. The{" "}
                <code className="font-mono text-[10px]">/listing/*</code> template&apos;s
                thin-content crisis averages out with the clean article pages.
                Site scores{" "}
                <span className="font-semibold text-foreground">caution</span>: the
                problem is invisible.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/30">
                  {/* Proportional segment bars */}
                  <div className="flex h-full">
                    <div className="bg-destructive/60" style={{ width: "97%" }} />
                    <div className="bg-warning/50" style={{ width: "2%" }} />
                    <div className="bg-success/50" style={{ width: "1%" }} />
                  </div>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                  200 URLs, 1 pool
                </span>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-primary/80">
                Stratified sampling: by template
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Pages are sampled stratified across templates (up to 200). Each template
                gets its own verdict. The{" "}
                <code className="font-mono text-[10px]">/listing/*</code> cluster
                surfaces an 8/10 thin-content fire rate: unmistakable.{" "}
                <code className="font-mono text-[10px]">/article/*</code> gets
                credit for being clean.
              </p>
              <div className="mt-3 flex items-center gap-3">
                {[
                  { label: "/listing/:slug", color: "bg-warning/70", width: "70%" },
                  { label: "/category/:slug", color: "bg-warning/40", width: "30%" },
                  { label: "/article/:slug", color: "bg-success/50", width: "15%" },
                ].map((b) => (
                  <div key={b.label} className="flex flex-1 flex-col gap-1">
                    <div className="h-2 overflow-hidden rounded-full bg-muted/30">
                      <div className={`h-full rounded-full ${b.color}`} style={{ width: b.width }} />
                    </div>
                    <span className="font-mono text-[9px] text-muted-foreground truncate">
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
