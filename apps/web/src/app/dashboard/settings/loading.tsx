/** Generic dashboard section skeleton. Also caps Link prefetch at this boundary. */
export default function SectionLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-40 rounded bg-muted/50" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-28 rounded-[18px] border border-border/50 bg-card/30" />
      ))}
    </div>
  );
}
