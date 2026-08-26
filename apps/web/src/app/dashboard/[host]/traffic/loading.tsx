/** Skeleton for the Search Console card. Also caps prefetch at this boundary. */
export default function WorkspaceTrafficLoading() {
  return (
    <div
      className="flex animate-pulse flex-col gap-4 rounded-[18px] border border-border/60 bg-card/40 p-5"
      aria-busy="true"
      aria-label="Loading traffic"
    >
      <div className="h-3 w-40 rounded bg-muted/50" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded bg-muted/40" />
        ))}
      </div>
      <div className="h-24 rounded-[12px] bg-muted/30" />
      <div className="h-20 rounded-[12px] bg-muted/25" />
    </div>
  );
}
