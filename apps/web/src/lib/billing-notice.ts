/**
 * What to tell a user about their subscription, derived from the state the
 * Polar webhook / self-heal sync stores on user_profile. Pure so the billing
 * page, the dashboard banner and the pricing page can't disagree.
 *
 *   past_due  -> renewal charge failed; Pro is kept through Polar's retry window
 *   canceling -> canceled at period end; Pro until `date`, then Free
 *   active    -> renews on `date`
 */
export type BillingNotice =
  | { kind: "past_due"; date: Date | null }
  | { kind: "canceling"; date: Date | null }
  | { kind: "active"; date: Date | null }
  | { kind: "none" };

export function billingNotice(state: {
  plan: "free" | "pro";
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  planExpiresAt: Date | null;
}): BillingNotice {
  if (state.plan !== "pro") return { kind: "none" };
  const date = state.planExpiresAt;
  if (state.subscriptionStatus === "past_due") return { kind: "past_due", date };
  // A subscription canceled with grace keeps status "active" and flips the flag;
  // status "canceled" with plan still pro is the same grace window.
  if (state.cancelAtPeriodEnd || state.subscriptionStatus === "canceled") return { kind: "canceling", date };
  return { kind: "active", date };
}
