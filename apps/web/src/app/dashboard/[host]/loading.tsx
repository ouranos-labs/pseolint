/**
 * Loading boundary for the domain workspace. Two jobs:
 *  1. Caps Next.js Link prefetch at this boundary so prefetching a host link no
 *     longer executes the full page render (10+ DB queries). Without a loading
 *     boundary, default prefetch fetches the entire dynamic render — and the
 *     /dashboard index prefetching every domain at once saturated Neon's
 *     connections (CONNECT_TIMEOUT). See db/index.ts and lib/db-retry.ts.
 *  2. Gives a skeleton during the heavy render on real navigation.
 */
export default function DomainWorkspaceLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading workspace">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 rounded-md bg-muted/60" />
        <div className="h-7 w-24 rounded-md bg-muted/40" />
      </div>

      {/* gsc status strip */}
      <div className="h-12 rounded-[18px] bg-muted/30" />

      {/* headline: big risk number + tile grid */}
      <div className="grid gap-6 rounded-[28px] border border-border/70 bg-card/40 p-7 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:gap-10 sm:p-8">
        <div className="flex flex-col items-start gap-3">
          <div className="h-20 w-28 rounded-lg bg-muted/50" />
          <div className="h-3 w-24 rounded bg-muted/40" />
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-md bg-muted/40" />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-muted/30" />
            ))}
          </div>
        </div>
      </div>

      {/* trend + findings */}
      <div className="h-40 rounded-[18px] bg-muted/25" />
      <div className="h-64 rounded-[18px] bg-muted/20" />
    </div>
  );
}
