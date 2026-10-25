import { describe, it, expect } from "vitest";
import { billingNotice } from "@/lib/billing-notice";

const date = new Date("2026-12-01T00:00:00Z");
const base = { plan: "pro" as const, subscriptionStatus: "active", cancelAtPeriodEnd: false, planExpiresAt: date };

describe("billingNotice", () => {
  it("free users get no notice", () => {
    expect(billingNotice({ ...base, plan: "free", subscriptionStatus: "past_due" })).toEqual({ kind: "none" });
  });
  it("active renews", () => {
    expect(billingNotice(base)).toEqual({ kind: "active", date });
  });
  it("past_due wins over everything", () => {
    expect(billingNotice({ ...base, subscriptionStatus: "past_due", cancelAtPeriodEnd: true })).toEqual({ kind: "past_due", date });
  });
  it("cancel-at-period-end never reads as renewing", () => {
    expect(billingNotice({ ...base, cancelAtPeriodEnd: true })).toEqual({ kind: "canceling", date });
    expect(billingNotice({ ...base, subscriptionStatus: "canceled" })).toEqual({ kind: "canceling", date });
  });
});
