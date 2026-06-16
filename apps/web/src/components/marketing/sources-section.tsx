import type { MarketingSourceRef } from "@/lib/marketing-sources";
import { resolveSources } from "@/lib/marketing-sources";

/**
 * Renders the "Sources" section shared by the rule / symptom / tool reference
 * pages. Each item is a real authoritative outbound link (Google Search
 * Central, web.dev, schema.org, a DOI) followed by a page-specific note.
 *
 * This grounds the page's quantified claims for `content/citation-coverage` and
 * for AI Overviews, which weight pages that cite primary sources.
 */
export function SourcesSection({
  sources,
}: {
  sources: readonly MarketingSourceRef[];
}): React.JSX.Element | null {
  if (!sources || sources.length === 0) return null;
  const resolved = resolveSources(sources);
  return (
    <section className="mx-auto max-w-5xl px-5 mt-12">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Sources
      </h2>
      <ul className="space-y-3">
        { resolved.map((s, i) => (
          <li
            key={ `${s.url}-${i}` }
            className="rounded-[18px] border border-border/60 bg-card/40 p-4 text-sm leading-relaxed"
          >
            <a
              href={ s.url }
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              { s.title }
            </a>
            <span className="text-muted-foreground"> — { s.note }</span>
          </li>
        )) }
      </ul>
    </section>
  );
}
