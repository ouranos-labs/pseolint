# Chrome Web Store listing — pseolint

Copy + form answers for submission. Keep this in sync with `manifest.json` and
`PRIVACY.md`; the #1 cause of store takedowns is a listing that doesn't match
behaviour.

## Name
pseolint — pSEO risk on the SERP

## Short description (≤132 chars)
See which Google results are templated-SEO risks. Click Scan: pseolint flags
thin, soft-404, and OG-missing pages right on the SERP.

## Category
Developer Tools

## Detailed description
pseolint flags programmatic-SEO failure patterns on the pages you're already
looking at — the live Google results page.

Click the toolbar icon and hit **Scan**. pseolint fetches each ranked result,
checks it against a subset of the open-source pseolint rule engine, and draws a
health badge on the risky ones:

• **thin** — the page has too little substantive content
• **soft 404** — returns HTTP 200 but reads like an error page
• **no OG tags** — missing the Open Graph metadata AI Overviews lean on

Badges are signals, not verdicts. Click one to open the full hosted audit for
that site at pseolint.dev — template-level risk across the whole site.

Built privacy-first: nothing runs until you click Scan, page analysis happens
in your browser, page content is discarded, and **no data about you is sent to
pseolint or anyone else**. The rule logic is the same open-source engine
(MIT) behind the pseolint CLI and GitHub Action.

Not a general SEO audit — no Core Web Vitals, backlinks, or keyword research.
It does one thing: catch the doorway/thin/soft-404 patterns that get
programmatic sites suppressed.

## Permission justifications (per-permission, required at submission)
- **activeTab** — When you click Scan in the popup, we message the Google
  results tab you're viewing to start the scan. Scoped to the current tab, on
  your click.
- **Host access — www.google.com/search** — The extension shows its badges on
  Google search results pages.
- **Optional host access — https://\*/\*** — Requested from the Scan click so the
  background worker can fetch the ranked result pages to analyse them. Granted
  by the user per scan; not standing access.
- **Remote code** — None. Everything ships in the signed bundle; CSP forbids
  eval and external scripts.

## Data-safety / privacy practices form
- Personal/sensitive data collected or transmitted: **None.**
- Data sold to third parties: **No.**
- Data used for purposes unrelated to core function: **No.**
- The single egress is user-initiated: clicking a badge opens pseolint.dev with
  the clicked result URL as a query parameter (a normal navigation).
- Privacy policy URL: (host `PRIVACY.md` at e.g. https://pseolint.dev/privacy/extension)

## Assets
Source in `marketing/directory-submissions/assets/`: `screenshot-1.png`,
`screenshot-2.png`, `banner-1200x630.png`, `logo-128/256/512.png`.
Still needed: 1–2 screenshots of the badges on a real SERP (capture via
load-unpacked).
