import type { ReactNode } from "react";

/**
 * Inline `backtick` markup for marketing copy.
 *
 * Two reasons this exists rather than rendering the strings raw:
 *
 * 1. `lib/marketing-rules.ts` has always used backticks around technical terms
 *    (`thinMinWords`, `spam/boilerplate-ratio`, `<header>`). Nothing interpreted
 *    them, so the rule pages shipped literal backticks to readers.
 * 2. The engine's content rules strip EXAMPLE_REGION_SELECTOR: "pre, code,
 *    blockquote, figure, samp, kbd, [data-example]": before scanning, so that a
 *    page *documenting* a pattern isn't scored as though it were committing it.
 *    Emitting <code> is how a page says "this is a specimen, not my prose",
 *    which is the engine's designed mechanism rather than an allowlist carve-out.
 *
 * Specimens get marked up; genuine prose usage is left alone and still counts.
 */
export function renderInline(text: string): ReactNode[] {
  // String.split on a capturing group alternates [plain, captured, plain, ...],
  // so odd indices are exactly the backticked spans.
  return text.split(/`([^`]+)`/g).map((chunk, i) =>
    i % 2 === 1 ? (
      <code
        key={i}
        className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.9em] text-foreground"
      >
        {chunk}
      </code>
    ) : (
      chunk
    ),
  );
}

/**
 * Strips backtick markup for plain-text sinks: JSON-LD, meta descriptions, any
 * place a literal backtick would leak into a SERP or into structured data.
 */
export function plainText(text: string): string {
  return text.replace(/`/g, "");
}
