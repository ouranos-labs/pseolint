---
"@pseolint/core": minor
"pseolint": minor
---

Add opt-in CrUX field data to `tech/core-web-vitals`. With a free Chrome UX Report API key (`--crux-api-key` / `CRUX_API_KEY`, or the `crux` core option), the auditor fetches real-user p75 LCP, CLS, **and INP** — the Core Web Vitals Google actually ranks on, including INP, which the lab `--render` path structurally cannot produce. The rule prefers field data when present and falls back to the lab render otherwise.

CrUX only has data for URLs/origins with enough real traffic, so per-URL lookups are capped (default 150, `--crux-max-lookups` to raise) and every page falls back to its origin-level field vitals — findings label the reading as per-URL vs origin-level. The client (`fetchCruxFieldVitals`) hits only Google's fixed CrUX endpoint (no SSRF surface, no external-authority dependency on your own content), makes no calls without a key, and treats any network / no-data condition as "no field data" rather than failing the audit.
