---
"@pseolint/core": minor
"pseolint": minor
"@pseolint/mcp": minor
---

feat: safeMode preset + safeFetch export + maxCrawlDiscovered ceiling + followRedirects option; MCP defaults to safeMode="saas"

Builds on v0.3.2's SSRF / abort / robots primitives with higher-level
convenience wrappers. Consolidates the a-la-carte safety options into a
single preset so downstream packages (MCP, the hosted web app) don't
need to remember to flip three flags.

## AuditOptions.safeMode

New preset field that flips multiple defaults at once:

    safeMode: "saas"
      guardSsrf:           true    (DNS-validated SSRF check on every URL)
      respectRobotsTxt:    true    (skip Disallow'd sitemap URLs)
      followRedirects:     true    (audits need the final URL)
      maxCrawlDiscovered:  2000    (ceiling on link-discovery fan-out)
      maxFetchBytes:       10 MB   (tighter cap for hosted tenants)

    safeMode: "cli"
      guardSsrf:           false   (dev-on-localhost doesn't break)
      respectRobotsTxt:    true
      followRedirects:     true
      maxCrawlDiscovered:  5000
      maxFetchBytes:       50 MB

Individual options explicitly passed to AuditOptions override the preset.
`safeMode: "saas"` with `guardSsrf: false` → guardSsrf stays off. "Not
set" uses the preset value.

## safeFetch(url, options?)

New export. Thin wrapper around cachedFetch that always validates the
target host via validateTargetHost. Useful for non-audit SSRF-safe
fetches (metadata lookups, favicon fetches, webhook URL verification
etc.) outside the audit pipeline.

    import { safeFetch } from "@pseolint/core";

    const response = await safeFetch("https://user-submitted.url/", {
      timeoutMs: 10000,
      followRedirects: false,
    });
    // Throws SSRFError on private IP / DNS-rebinding
    // Throws DnsResolutionError on NXDOMAIN

## maxCrawlDiscovered hard ceiling

Previously the link-discovery phase could grow an internal `discoveredUrls`
set unbounded (only the subsequent fetch was byte-capped). A malicious
site with 100k self-linking pages could balloon that set before sampling.
Now capped at 5000 by default (2000 under safeMode="saas"). When the
ceiling trips, a stderr diagnostic is emitted.

## followRedirects option

    followRedirects: false

Returns 3xx responses as-is (status + Location header) instead of
following. Useful for security-sensitive audits that must not follow
the exact submitted URL, and for diagnostic audits that want to report
redirect chains.

## CLI additions

    pseolint <site> --safe-mode saas           # applies the preset
    pseolint <site> --safe-mode cli
    pseolint <site> --no-respect-robots        # audit Disallow'd URLs
    pseolint <site> --no-follow-redirects      # report 3xx as-is
    pseolint <site>                            # ctrl-C now does a clean
                                                # abort (in-flight fetches
                                                # cancel; a second ctrl-C
                                                # within ~1s forces exit)

SIGINT handler plumbs an AbortController into the audit so in-flight
fetches cancel cleanly instead of the process being hard-killed mid-read.

## MCP defaults to safeMode="saas"

MCP tools (`audit_site`, `explain_score`, `check_page_technical`) now
default to `safeMode: "saas"` — AI assistants running in end-user
environments with `audit_site` tool access shouldn't be able to scan
AWS metadata, localhost, or RFC1918 networks via a URL argument.

## Public API additions

Exported from @pseolint/core:
  - `safeFetch` (from cache.js)
  - `SafeMode` type (from types.js)

New fields on `AuditOptions`:
  - `safeMode?: "saas" | "cli"`
  - `maxCrawlDiscovered?: number`
  - `followRedirects?: boolean`
