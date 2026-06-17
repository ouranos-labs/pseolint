# pseolint extension — Privacy

_Last updated: 2026-06-17_

The pseolint browser extension reads as little as possible and sends nothing
about you to anyone. This policy describes exactly what it does — and it matches
the code (see `docs/extension-architecture.md` §8–§11).

## Default ("landscape") — automatic, no permission

On a Google search results page, the extension reads only what's already on that
page — the ranked result URLs — to show how *programmatic* the results are
(a small "N of M results templated" chip plus neutral markers on clustered
results). This runs automatically, makes **no network request**, asks for **no
permission**, and collects nothing.

## Deep scan ("risk") — only when you ask

Nothing is fetched until **you open the side panel (toolbar icon) and click
"Deep scan."** That click grants host access for that scan only. Then:

1. The service worker fetches each ranked result page directly from its own site,
   with **no cookies and no session** (`credentials: "omit"`).
2. Each page is analysed **entirely inside your browser** for a few SEO signals
   (title, Open Graph tags, word count, HTTP status, headings); the result becomes
   a coloured badge and the **page content is discarded** — never stored or sent.
3. Risk badges appear on the results, and a summary list appears in the side panel.

## What leaves your browser

- **To pseolint: nothing — unless you click a badge or audit link**, which opens
  `https://pseolint.dev` in a new tab with that result's URL as a query parameter
  (an ordinary navigation you initiate; pseolint.dev's privacy policy then applies).
- **To the analysed sites (deep scan only):** a normal page request, no cookies.

## What it never does

- No analytics, telemetry, tracking, ads, or fingerprinting.
- No collection of browsing history, personal information, form data, or credentials.
- No data stored at rest (the extension uses no storage).
- It only ever reads the Google results page you're on, and — on deep scan — the
  ranked results you ask it to check. It cannot read your email, banking, or any
  other site, because it never holds standing access to them.

## Permissions, and why

- **`sidePanel`** — to show the results panel.
- **Host access to `https://www.google.com/search`** — to read the results page and
  draw badges on it.
- **Optional host access (`https://*/*`), requested when you click Deep scan** — so
  the service worker can fetch the ranked result pages to analyse them. Granted
  **per scan by you**, never held as standing access.

## Contact

Questions: hello@pseolint.dev. Source is open (MIT) at
github.com/ouranos-labs/pseolint under `apps/extension`.
