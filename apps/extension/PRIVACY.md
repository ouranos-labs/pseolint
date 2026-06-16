# pseolint extension — Privacy

_Last updated: 2026-06-16_

The pseolint browser extension is built to read as little as possible and to
send nothing about you to anyone. This policy describes exactly what it does —
and it matches the code (see `docs/extension-architecture.md` §8–§11).

## What it does, and when

Nothing happens until **you click "Scan"** in the extension popup. There is no
background activity, no automatic scanning, and no data collection.

When you click Scan on a Google search results page:

1. The extension reads the **ranked result URLs** from the page you're viewing.
2. With the host access you grant on that click, the extension's service worker
   **fetches each of those result pages directly from their own sites** — with
   **no cookies and no session** attached (`credentials: "omit"`).
3. Each page is analysed **entirely inside your browser**. The page's HTML is
   parsed for a small set of SEO signals (title, Open Graph tags, word count,
   HTTP status, headings), the result is turned into a coloured badge, and the
   **page content is discarded**. None of it is stored or transmitted.
4. A health badge is drawn next to each flagged result.

## What leaves your browser

- **To pseolint: nothing — unless you click a badge.** Clicking a badge opens
  `https://pseolint.dev` in a new tab with that result's URL as a query
  parameter, so the hosted tool can run a full audit. That is an ordinary page
  navigation you initiate; pseolint.dev's own privacy policy then applies.
- **To the analysed sites:** a normal page request (as if you visited the page),
  with no cookies or credentials attached.

## What it never does

- No analytics, telemetry, tracking, ads, or fingerprinting.
- No collection of browsing history, personal information, form data, or
  credentials.
- No data stored at rest (the extension uses no storage).
- It never reads pages other than the Google results page you're on and the
  ranked results you ask it to scan. It cannot read your email, banking, or any
  other site, because it never requests standing access to them.

## Permissions, and why

- **`activeTab`** — so the popup can tell the results page you're viewing to
  start the scan when you click. Scoped to the current tab, on your gesture.
- **Host access to `https://www.google.com/search`** — to show badges on Google
  results pages.
- **Optional host access (`https://*/*`), requested on the Scan click** — so the
  service worker can fetch the ranked result pages to analyse them. This is
  granted **per scan by you**, not held as standing access.

## Contact

Questions: hello@pseolint.dev. Source is open (MIT) at
github.com/ouranos-labs/pseolint under `apps/extension`.
