import { describe, it, expect } from "vitest";
import { toTrackArgs, type AnalyticsEvent } from "./events";

describe("toTrackArgs", () => {
  it("returns [name, props] for an event with props", () => {
    const e: AnalyticsEvent = { name: "audit_submitted", props: { host: "x.com", force: false, source: "landing" } };
    expect(toTrackArgs(e)).toEqual(["audit_submitted", { host: "x.com", force: false, source: "landing" }]);
  });

  it("returns [name, {}] for a propless event", () => {
    const e: AnalyticsEvent = { name: "audit_form_engaged" };
    expect(toTrackArgs(e)).toEqual(["audit_form_engaged", {}]);
  });
});
