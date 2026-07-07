# Chrome Web Store listing — pseolint

Copy + form answers for submission. Keep this in sync with `manifest.json` and
`PRIVACY.md`; the #1 cause of store takedowns is a listing that doesn't match
behaviour.

## Name
pseolint — pSEO risk on the SERP

## Short description (≤132 chars)
Competitive recon for any Google SERP: how programmatic it is, who's beatable, the content bar, and who's AI-Overview-ready. Free.

## Category
Developer Tools

## Detailed description
pseolint surfaces programmatic-SEO failure patterns on the page you're already
looking at — the live Google results page.

The moment you land on a results page, pseolint shows the **landscape**: how many
of the results are templated and across how many hosts — with **no permission
prompt and nothing fetched**. It reads only what's already on the page.

Want the detail? Open the side panel and hit **Deep scan** — pseolint fetches the
ranked results and turns the SERP into a **competitive scorecard**:

• a one-line **strategic takeaway** (beatable? a fortress? an AEO gap?)
• **saturation** + the **content bar** you'd need to clear
• the **opening** — the weakest page that still ranks
• per-result **depth bars + fact tags** (thin · soft-404 · no-OG · templated · AEO-ready)
• set **your domain** to see exactly where you stand

It's recon, not verdicts. The deep teardown — and how to win — lives at pseolint.dev.

Built privacy-first: the default landscape needs no permission and fetches nothing;
deep scan analyses pages **in your browser**, discards the content, and sends **no
data about you to anyone**. The rule logic is the same open-source engine (MIT)
behind the pseolint CLI and GitHub Action.

Not a general SEO audit — no Core Web Vitals, backlinks, or keyword research. It
does one thing: catch the doorway/thin/soft-404 patterns that get programmatic
sites suppressed.

## Permission justifications (per-permission, required at submission)
- **sidePanel** — shows the deep-scan results panel.
- **storage** — remembers the domain you optionally type to track your position (local only, never transmitted).
- **Host access — www.google.com/search** — reads the results page and draws badges
  on it (the zero-permission landscape layer).
- **Optional host access — https://\*/\*** — requested only when the user clicks
  Deep scan, so the background worker can fetch the ranked result pages to analyse
  them. Granted by the user per scan; not standing access.
- **Remote code** — None. Everything ships in the signed bundle; CSP forbids eval
  and external scripts.

## Data-safety / privacy practices form
- Personal/sensitive data collected or transmitted: **None.**
- Data sold to third parties: **No.**
- Data used for purposes unrelated to core function: **No.**
- Default landscape layer: no network requests at all.
- The only egress is user-initiated: clicking a badge opens pseolint.dev with
  public SERP context as query parameters — the clicked result URL, the search
  query, and the top-ranked competitor's host (a normal navigation).
- Privacy policy URL: (host `PRIVACY.md` at e.g. https://pseolint.dev/privacy/extension)

## Assets
Source in `marketing/directory-submissions/assets/`: `screenshot-1.png`,
`screenshot-2.png`, `banner-1200x630.png`, `logo-128/256/512.png`.
Still needed: screenshots of (1) the auto landscape chip + templated markers and
(2) the side panel after a deep scan — capture via load-unpacked.
