/** Skeleton for the monitoring tab. Also caps prefetch at this boundary. */
export default function WorkspaceMonitoringLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading monitoring">
      <div className="h-48 rounded-[18px] bg-muted/25" />
      <div className="h-32 rounded-[18px] bg-muted/20" />
      <div className="h-40 rounded-[18px] bg-muted/20" />
    </div>
  );
}
