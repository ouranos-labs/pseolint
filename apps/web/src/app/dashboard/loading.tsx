/**
 * Skeleton for the dashboard index (portfolio for Pro, audit history for free).
 * Mirrors the portfolio card grid so the layout doesn't jump when data lands.
 */
export default function DashboardHomeLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex items-center justify-between">
        <div className="h-6 w-32 rounded bg-muted/50" />
        <div className="h-9 w-40 rounded-[14px] bg-muted/30" />
      </div>
      <div className="flex flex-col gap-4 md:block md:columns-2 xl:columns-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="break-inside-avoid rounded-[20px] border border-border/60 bg-card/40 p-1.5 md:mb-4"
          >
            <div className="aspect-[1200/630] rounded-[16px] bg-muted/30" />
            <div className="mx-1 mt-2 h-4 w-2/3 rounded bg-muted/40" />
            <div className="mx-1 mt-2 h-3 w-full rounded bg-muted/25" />
            <div className="mx-1 mt-4 flex items-center justify-between">
              <div className="h-3 w-16 rounded bg-muted/25" />
              <div className="h-5 w-14 rounded-full bg-muted/30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
