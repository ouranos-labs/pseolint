import type { BillingNotice } from "@/lib/billing-notice";
import { formatDate } from "@/lib/format";

/** POSTs to the Polar customer portal; Polar handles card updates and resuming. */
export function PortalButton({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <form action="/api/billing/portal" method="POST" className="inline">
      <button
        type="submit"
        className={
          primary
            ? "inline-flex h-9 items-center rounded-[12px] bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            : "inline-flex h-9 items-center rounded-[12px] border border-border-strong px-3 text-xs hover:bg-secondary"
        }
      >
        {label}
      </button>
    </form>
  );
}

const when = (d: Date | null) => (d ? formatDate(d) : "the end of this billing period");

/**
 * The past_due / canceling warning, shared by the billing page and the
 * dashboard banner so both say the same thing. Renders nothing otherwise.
 */
export function BillingAttentionNotice({ notice }: { notice: BillingNotice }) {
  if (notice.kind === "past_due") {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-foreground">
        <span>Your last payment failed. Update your card by {when(notice.date)} to keep monitoring.</span>
        <PortalButton label="Update card" primary />
      </div>
    );
  }
  if (notice.kind === "canceling") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border/60 bg-muted/30 px-4 py-3 text-sm text-foreground">
        <span>Pro until {when(notice.date)}, then Free.</span>
        <PortalButton label="Resume Pro" />
      </div>
    );
  }
  return null;
}
