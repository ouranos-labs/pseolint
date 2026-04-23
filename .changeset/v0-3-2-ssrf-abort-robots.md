---
"@pseolint/core": minor
"pseolint": patch
---

feat(core): SSRF guard, AbortSignal support, and robots.txt-honoring crawler

Three primitives for hosts that run pseolint against user-submitted URLs
(SaaS use case). All three also benefit local CLI users and introduce no
behaviour change by default.

## SSRF guard

New public API in `@pseolint/core`:

  - `isPrivateOrReservedHost(hostname)` — synchronous string check.
    Catches literal private IPs (`10.0.0.5`, `127.0.0.1`, `169.254.169.254`
    cloud-metadata), loopback hostnames (`localhost`), reserved TLD suffixes
    (`.local`, `.internal`, `.arpa`, `.intranet`, `.lan`, `.home`, `.private`,
    `.corp`), and IPv6 equivalents.

  - `validateTargetHost(hostname, options?)` — async. Runs the string check
    AND a DNS round-trip; rejects if ANY resolved A/AAAA record is in a
    private / reserved / link-local / multicast range. Mitigates DNS-
    rebinding where a public hostname resolves to 127.0.0.1.

  - `isPrivateIPv4` / `isPrivateIPv6` — helpers used by the above; also
    exported for consumers that want to validate their own IP checks.

  - `SSRFError` — thrown by `validateTargetHost` with `{ hostname, reason }`
    fields so callers can produce actionable user-facing messages.

New `AuditOptions.guardSsrf: boolean` (default: `false`). When true, the
hostname of an HTTP(S) source is validated at the start of `auditSource`
before any fetch. Default is off so local CLI users auditing
`http://localhost:3000` aren't broken.

SaaS operators are encouraged to call `validateTargetHost()` at the API
boundary (before enqueuing) rather than rely only on `guardSsrf: true` —
defense-in-depth.

## AbortSignal support

`AuditOptions.signal?: AbortSignal` — when aborted, in-flight fetches
cancel and `auditSource` throws. Works end-to-end: the signal is combined
with each request's timeout signal via a backport of `AbortSignal.any()`
(compatible with Node 18 minimum). Abort checkpoints also run between
the crawl phase and the enrich / triage phases so long-lived audits
don't outlive a cancelled request.

Host use cases: user cancelled the browser tab; per-user quota exhausted
mid-run; worker shutdown with graceful drain; overall audit wall-clock
exceeded.

## Robots.txt now honoured for OUR crawler

Previously the `robotsComplianceRule` flagged sitemap-vs-robots
disagreements as findings but the fetcher itself crawled disallowed URLs
anyway. Now: when fetching sitemap-supplied URLs, if the path matches a
`Disallow:` pattern in the target site's robots.txt (under `User-agent: *`),
the fetch is skipped.

This closes two concerns:

  - Legal / ethical: pseolint identifies itself with a distinct
    `+https://pseolint.dev/bot` user-agent. Honouring `Disallow:` directives
    is the table-stakes behaviour for a responsible bot.

  - Abuse: when the library is invoked from a hosted service, a user can't
    weaponise it to crawl sites that explicitly opted out. The existing
    discovered-link path already applied this check; the sitemap-URL path
    is now consistent.

The behaviour is unconditional for sitemap URLs (matches the pre-existing
behaviour on discovered links). If you need to audit disallowed URLs
intentionally — e.g. a staging site that disallows everything — point
pseolint at a local directory or file source instead of a live URL.

## Not changed

The non-render fetch path already used a distinct bot UA
(`pseolint/0.x.y; +https://pseolint.dev/bot`) and already clamped bytes
per run via `maxFetchBytes`. Those carry through unchanged.

## Public API additions

Exported from `@pseolint/core`:

  - `SSRFError`, `validateTargetHost`, `isPrivateOrReservedHost`,
    `isPrivateIPv4`, `isPrivateIPv6`
  - `ValidateTargetHostOptions` type

New fields on `AuditOptions`:

  - `signal?: AbortSignal`
  - `guardSsrf?: boolean`
