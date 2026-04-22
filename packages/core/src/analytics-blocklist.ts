/**
 * Known analytics / product-telemetry / session-replay hostnames.
 *
 * Rendered-mode audits would otherwise fire every client-side beacon on every
 * page they visit, injecting fake sessions into the site owner's dashboards.
 * The renderer intercepts outbound requests and aborts any whose hostname
 * includes one of these tokens (substring match — a single entry covers all
 * regional variants like `www.google-analytics.com`, `www1.google-analytics.com`, …).
 *
 * Conservative on the allow side: we don't block `fonts.googleapis.com`,
 * `gstatic.com`, `cdn.jsdelivr.net`, etc., because they can be legitimate
 * content-rendering dependencies. Errors-in-doubt are logged as warnings at
 * the call site and never throw.
 */
export const DEFAULT_ANALYTICS_HOSTS = [
  // Google stack
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
  "pagead2.googlesyndication.com",

  // Privacy-focused analytics
  "plausible.io",
  "umami.is",
  "umami.app",
  "fathom.io",
  "fathomdns.com",
  "simpleanalytics.com",
  "simpleanalyticscdn.com",

  // Product analytics
  "posthog.com",
  "mixpanel.com",
  "segment.com",
  "segment.io",
  "amplitude.com",
  "heap.io",
  "heapanalytics.com",
  "pendo.io",
  "mparticle.com",
  "rudderlabs.com",

  // Session replay / heatmaps
  "hotjar.com",
  "fullstory.com",
  "clarity.ms",
  "mouseflow.com",
  "luckyorange.com",
  "smartlook.com",
  "logrocket.com",
  "lr-ingest.com",

  // Error tracking (fires on every page load via init)
  "sentry.io",
  "bugsnag.com",

  // Marketing automation / CDPs
  "hubspot.com",
  "hs-analytics.net",
  "hs-scripts.com",
  "marketo.com",
  "marketo.net",

  // Chat widgets that auto-ping on page view
  "intercom.io",
  "intercomcdn.com",

  // Cloudflare / Vercel analytics
  "cloudflareinsights.com",
  "vercel-insights.com",
  "vercel-analytics.com",

  // Matomo SaaS
  "matomo.cloud",
  "matomo.org",

  // Datadog RUM
  "datadoghq.com",
  "datadoghq.eu",
  "ddog-gov.com",

  // New Relic browser agent
  "newrelic.com",
  "nr-data.net",
] as const;

// Pre-lower the default list once at module load — the renderer calls
// isAnalyticsRequest for every subresource of every rendered page, so avoiding
// a per-call `.toLowerCase()` of ~40 tokens matters on large audits.
const DEFAULT_ANALYTICS_HOSTS_LOWER: readonly string[] = DEFAULT_ANALYTICS_HOSTS.map((h) =>
  h.toLowerCase(),
);

/**
 * True when the URL's host contains one of the blocked substrings. In
 * `allow-first-party` mode, same-origin requests are allowed even if the host
 * matches the list (callers pass in the page origin).
 */
export function isAnalyticsRequest(
  url: string,
  options: {
    pageOrigin?: string;
    blockedHosts?: readonly string[];
    extraBlockedHosts?: readonly string[];
    mode?: "block" | "allow" | "allow-first-party";
  } = {},
): boolean {
  const mode = options.mode ?? "block";
  if (mode === "allow") return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (mode === "allow-first-party" && options.pageOrigin) {
    try {
      const origin = new URL(options.pageOrigin).origin;
      // "null" is the string form of opaque origins (`about:blank`, `data:`)
      // and must never be treated as matching any real origin.
      if (origin !== "null" && parsed.origin !== "null" && parsed.origin === origin) {
        return false;
      }
    } catch {
      // fall through — treat as cross-origin
    }
  }

  const host = parsed.host.toLowerCase();
  // Use the pre-lowered default unless the caller supplied their own list; the
  // caller list is lowered here on the fly (it's small and caller-controlled).
  const base = options.blockedHosts
    ? options.blockedHosts.map((h) => h.toLowerCase())
    : DEFAULT_ANALYTICS_HOSTS_LOWER;
  for (const token of base) {
    if (host.includes(token)) return true;
  }
  if (options.extraBlockedHosts) {
    for (const token of options.extraBlockedHosts) {
      if (host.includes(token.toLowerCase())) return true;
    }
  }
  return false;
}

export type AnalyticsMode = "block" | "allow" | "allow-first-party";
