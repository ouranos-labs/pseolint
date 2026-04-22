import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANALYTICS_HOSTS,
  isAnalyticsRequest,
} from "../src/analytics-blocklist.js";

describe("isAnalyticsRequest", () => {
  it("blocks Google Analytics in default mode", () => {
    expect(isAnalyticsRequest("https://www.google-analytics.com/g/collect")).toBe(true);
    expect(isAnalyticsRequest("https://region1.google-analytics.com/g/collect")).toBe(true);
    expect(isAnalyticsRequest("https://www.googletagmanager.com/gtag/js?id=G-XXX")).toBe(true);
  });

  it("blocks common analytics / session-replay vendors", () => {
    expect(isAnalyticsRequest("https://plausible.io/api/event")).toBe(true);
    expect(isAnalyticsRequest("https://app.posthog.com/e/")).toBe(true);
    expect(isAnalyticsRequest("https://api-eu.mixpanel.com/track")).toBe(true);
    expect(isAnalyticsRequest("https://static.hotjar.com/c/hotjar-123.js")).toBe(true);
    expect(isAnalyticsRequest("https://edge.fullstory.com/s/fs.js")).toBe(true);
    expect(isAnalyticsRequest("https://js.sentry-cdn.com/abc.min.js")).toBe(false); // sentry-cdn not in list, only sentry.io
    expect(isAnalyticsRequest("https://ingest.sentry.io/api/1/store/")).toBe(true);
  });

  it("allows same-origin when mode is allow-first-party", () => {
    const self = "https://example.com";
    // First-party path on the same origin is allowed even if host substring matches
    // — the origin check wins before the blocklist is consulted.
    expect(
      isAnalyticsRequest(`${self}/api/analytics/pageview`, {
        mode: "allow-first-party",
        pageOrigin: self,
      }),
    ).toBe(false);
    // Third-party analytics still blocked in allow-first-party mode.
    expect(
      isAnalyticsRequest("https://www.google-analytics.com/g/collect", {
        mode: "allow-first-party",
        pageOrigin: self,
      }),
    ).toBe(true);
  });

  it("mode=allow lets everything through", () => {
    expect(
      isAnalyticsRequest("https://www.google-analytics.com/g/collect", { mode: "allow" }),
    ).toBe(false);
    expect(
      isAnalyticsRequest("https://app.posthog.com/e/", { mode: "allow" }),
    ).toBe(false);
  });

  it("respects extraBlockedHosts on top of defaults", () => {
    expect(isAnalyticsRequest("https://my-internal-metrics.corp/beacon")).toBe(false);
    expect(
      isAnalyticsRequest("https://my-internal-metrics.corp/beacon", {
        extraBlockedHosts: ["my-internal-metrics.corp"],
      }),
    ).toBe(true);
  });

  it("allows content CDNs and fonts", () => {
    expect(isAnalyticsRequest("https://fonts.googleapis.com/css?family=Inter")).toBe(false);
    expect(isAnalyticsRequest("https://cdn.jsdelivr.net/npm/react@18/umd/react.js")).toBe(false);
    expect(isAnalyticsRequest("https://unpkg.com/vue@3/dist/vue.global.js")).toBe(false);
    expect(isAnalyticsRequest("https://gstatic.com/firebasejs/foo.js")).toBe(false);
  });

  it("returns false on malformed URLs rather than throwing", () => {
    expect(isAnalyticsRequest("not a url")).toBe(false);
    expect(isAnalyticsRequest("")).toBe(false);
  });

  it("is case-insensitive on hostname matching", () => {
    expect(isAnalyticsRequest("https://WWW.GOOGLE-ANALYTICS.COM/g/collect")).toBe(true);
  });

  it("DEFAULT_ANALYTICS_HOSTS contains the major vendors", () => {
    const asSet = new Set(DEFAULT_ANALYTICS_HOSTS);
    expect(asSet.has("google-analytics.com")).toBe(true);
    expect(asSet.has("googletagmanager.com")).toBe(true);
    expect(asSet.has("plausible.io")).toBe(true);
    expect(asSet.has("posthog.com")).toBe(true);
    expect(asSet.has("mixpanel.com")).toBe(true);
    expect(asSet.has("hotjar.com")).toBe(true);
    expect(asSet.has("sentry.io")).toBe(true);
  });

  it("DEFAULT_ANALYTICS_HOSTS contains only host tokens (no paths)", () => {
    // `host.includes(token)` is the matcher — a token containing `/` can never
    // match any URL's host and would silently do nothing.
    for (const token of DEFAULT_ANALYTICS_HOSTS) {
      expect(token).not.toMatch(/\//);
      expect(token.length).toBeGreaterThan(2);
    }
  });

  it("allow-first-party: opaque origins (about:blank, data:) never count as first-party", () => {
    // If page origin resolves to "null" (opaque), analytics from real hosts must
    // still be blocked — the opaque origin must never be treated as matching.
    expect(
      isAnalyticsRequest("https://www.google-analytics.com/g/collect", {
        mode: "allow-first-party",
        pageOrigin: "about:blank",
      }),
    ).toBe(true);
    expect(
      isAnalyticsRequest("https://www.google-analytics.com/g/collect", {
        mode: "allow-first-party",
        pageOrigin: "data:,hello",
      }),
    ).toBe(true);
  });
});
