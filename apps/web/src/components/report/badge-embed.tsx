"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Copy-paste embed for the grade badge.
 *
 * Rendered only for leaderboard-eligible reports, which is the same gate
 * /api/badge/[host] enforces server-side (public, completed, risk under the
 * leaderboard ceiling, at least the page floor, unexpired). A snippet can
 * therefore never hand someone a badge URL that 404s.
 *
 * Why it exists at all: an embedded badge is a voluntary editorial link from a
 * site that passed the audit. That is the one link source this product can grow
 * without asking anyone for a favour, and it is only available to sites that
 * earned an A or B, which keeps it aspirational rather than promotional.
 *
 * ponytail: the snippet links to this report's slug. That URL is stable and
 * permanent for eligible audits, but it becomes an older snapshot as new audits
 * run, while the image always resolves to the host's latest eligible grade.
 * Point the link at a stable per-host public page if one is ever added.
 */
export function BadgeEmbed({
  host,
  reportUrl,
  badgeUrl,
}: {
  host: string;
  reportUrl: string;
  badgeUrl: string;
}) {
  const markdown = `[![pseolint grade](${badgeUrl})](${reportUrl})`;
  const html = `<a href="${reportUrl}"><img src="${badgeUrl}" alt="pseolint grade for ${host}" /></a>`;

  return (
    <section className="mb-6 rounded-[22px] border border-border/70 bg-card/50 p-5">
      <div className="flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG served by our
            own route; next/image would proxy it for no benefit. */}
        <img src={badgeUrl} alt={`pseolint grade for ${host}`} width={148} height={20} />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Show the grade</h2>
          <p className="text-xs text-muted-foreground">
            {host} passed the audit. Embed the badge on your site or README; it always
            shows your current grade.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Snippet label="Markdown" value={markdown} />
        <Snippet label="HTML" value={html} />
      </div>
    </section>
  );
}

function Snippet({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context). The
      // snippet stays selectable by hand, so there is nothing to recover.
    }
  };
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs text-foreground">
        {value}
      </code>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Copy ${label} snippet`}
        aria-live="polite"
        className={cn(
          "shrink-0 rounded-lg border border-border-strong px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary",
        )}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
