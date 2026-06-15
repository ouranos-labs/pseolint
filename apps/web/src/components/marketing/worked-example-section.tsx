/**
 * Renders the optional "in practice" worked-example section shared by the
 * rule / symptom / tool reference pages. Each paragraph is the page's own
 * editorial voice illustrating the concept on a concrete, named scenario.
 *
 * Returns null when a page has no extra content, so it only appears where it
 * adds something.
 */
export function WorkedExampleSection({
  title,
  paragraphs,
}: {
  title: string;
  paragraphs: readonly string[];
}): React.JSX.Element | null {
  if (!paragraphs || paragraphs.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-4">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-foreground">
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}
