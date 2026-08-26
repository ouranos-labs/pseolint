/**
 * Loading boundary for the workspace body. Two jobs:
 *  1. Caps Next.js Link prefetch at this boundary so prefetching a host link no
 *     longer executes the full page render. Without a loading boundary, default
 *     prefetch fetches the entire dynamic render, and the /dashboard index
 *     prefetching every domain at once saturated Neon's connections
 *     (CONNECT_TIMEOUT). See db/index.ts and lib/db-retry.ts.
 *  2. Gives a skeleton during the render on real navigation.
 *
 * Only the BODY is skeletoned: the header, domain switcher and tab bar live in
 * layout.tsx, which resolves off two cheap cached queries and paints first.
 */
export default function WorkspaceOverviewLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading overview">
      {/* headline: big verdict + risk number + tile grid */}
      <div className="grid gap-6 rounded-[28px] border border-border/70 bg-card/40 p-7 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:gap-10 sm:p-8">
        <div className="flex flex-col items-start gap-3">
          <div className="h-8 w-32 rounded-full bg-muted/50" />
          <div className="h-8 w-24 rounded-lg bg-muted/50" />
          <div className="h-3 w-28 rounded bg-muted/40" />
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

      {/* run diff + findings */}
      <div className="h-24 rounded-[18px] bg-muted/25" />
      <div className="h-64 rounded-[18px] bg-muted/20" />
    </div>
  );
}
