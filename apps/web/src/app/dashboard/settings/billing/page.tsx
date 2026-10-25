import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { getBillingState } from "@/lib/plan";
import { billingNotice } from "@/lib/billing-notice";
import { ResyncSubscriptionButton } from "./resync-button";
import { formatDate } from "@/lib/format";
import { TrackedLink } from "@/components/analytics/tracked-link";
import { BillingAttentionNotice, PortalButton } from "@/components/dashboard/billing-notice";

const PORTAL_ERRORS: Record<string, string> = {
  portal:
    "We don't have a Polar customer record for you yet, so there is no billing portal to open. If you just paid, resync below; otherwise subscribe from the pricing page.",
  portal_unavailable:
    "Couldn't open the billing portal right now. Try again in a minute, or email hello@pseolint.dev.",
};

export default async function BillingSettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/settings/billing");
  const state = await getBillingState(session.user.id);
  const notice = billingNotice(state);
  const { error } = await searchParams;
  const portalError = error ? PORTAL_ERRORS[error] : undefined;

  // Never say "Renews" for a subscription that won't: canceling shows "Ends".
  const dateLabel =
    notice.kind === "active" ? "Renews"
    : notice.kind === "canceling" ? "Ends"
    : notice.kind === "past_due" ? "Pay by"
    : "Expired";

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-xl font-medium">Billing</h1>
      {portalError && (
        <p role="alert" className="rounded-[14px] border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-foreground">
          {portalError}
        </p>
      )}
      <BillingAttentionNotice notice={notice} />
      <div className="rounded-[18px] border border-border/60 p-5">
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-medium capitalize text-foreground">{state.plan}</dd>
          {state.planExpiresAt && (
            <>
              <dt className="text-muted-foreground">{dateLabel}</dt>
              <dd className="text-foreground">{formatDate(state.planExpiresAt)}</dd>
            </>
          )}
        </dl>
        {state.plan === "free" ? (
          <div className="mt-4 flex flex-col gap-3">
            <TrackedLink href="/pricing" event={ { name: "upgrade_clicked", props: { source: "billing" } } } className="inline-flex h-10 w-fit items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Upgrade to Pro →</TrackedLink>
            <div className="rounded-[12px] border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Just paid and still seeing free?{" "}
              <ResyncSubscriptionButton />{" "}
              We'll fetch your subscription directly from Polar.
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <PortalButton label="Manage in Polar →" />
          </div>
        )}
      </div>
    </div>
  );
}
