# Extension → SaaS funnel: scout → win → hold

**Date:** 2026-06-22
**Status:** design approved, pre-implementation
**Scope:** turn the (OSS, free) Chrome extension's SERP-recon into a genuine acquisition→conversion funnel for the hosted pseolint SaaS.

## Strategy (the decision behind the design)

The extension is open-source and free — like the CLI, it's an *acquisition* tool, never paywalled; the hosted SaaS is the monetized layer. The funnel risk the user raised ("the extension is too good to be a funnel") is real only if the job is one-and-done. SERP competition is *continuous and at scale*, so a great free **snapshot** doesn't satisfy the job — it whets the appetite for what a snapshot can't be.

The conversion is anchored on the **hot moment the extension creates** — *"I just found a weak SERP I can break into"* — not on monitoring (a slow-burn, scale-assuming, commodity pitch). That hot moment points straight at the moat:

> **Extension = the scout** (finds SERP openings) · **pseolint = the factory** (fill them *at scale without getting penalized* — render-accurate audit + template-aware pSEO scoring).

Spine: **Scout** (free extension snapshot) → **Win** (paid SaaS: audit/build the page that takes the opening, safely, at scale) → **Hold** (monitoring: watch inserted pages keep ranking + scout new openings — the retention/expansion layer, *not* the front door).

## Current state (what exists)

- `apps/extension/src/ui/sidepanel.js` already computes the scout: `teardown(model)` → `takeaway(t)`, `t.opening` (`{host, rank, words, tags}` — the weakest ranked page), `t.rows` (per-result `{host, words, tags, url}`), `t.monotony`, and `userHost` (where you stand).
- Deep-link to the SaaS already exists: `AUDIT_PREFILL = "https://pseolint.dev/?prefill="`; the SaaS `landing-form.tsx` reads `?prefill=<url>` and auto-submits an audit.
- **Gap:** every CTA today targets a *competitor's* page (`?prefill=<r.url>`) or a generic "Audit your own site →." The scout exists; the *win bridge* does not. No qualify, no hold.

## Design

### 1. Spine mapped to the panel's existing states
- **Scout (sharpen, no new logic):** reframe the takeaway + `t.opening` rendering action-first — *"#3 ranks on a thin, no-OG page — that's your way in,"* not a flat description.
- **Win (new primary CTA):** replaces the generic CTA. When `t.opening` exists, render the win CTA *adapted to the user's position* (§2) — climb / insert / set-domain — carrying competitive context into the hand-off.
- **Hold (v1 = none in the extension):** pseolint's monitoring watches *domains* (audit-state), not SERP positions — so a "Watch this SERP" CTA would over-promise a rank-tracking feature that doesn't exist (§5). v1 is **scout → win**; "hold" is the SaaS's *existing* post-audit monitoring upsell (downstream, on the report), never a new extension CTA.

### 2. The Win bridge — deep-link contract (extension → SaaS)
- Extension builds: `https://pseolint.dev/?prefill=<target>&from=serp&q=<keyword>&against=<opening-host>`
  - `target` (= `prefill`) depends on the user's position on this SERP:
    - **climb** — `userHost` matches a ranked row → the user's *ranking page* (that row's URL); CTA "Climb past #N → audit your page."
    - **insert** — `userHost` set but not ranking → the `userHost` *site root*; CTA "You're not on this SERP yet — audit your site to insert."
    - **set-domain** — no `userHost` → the CTA prompts inline for the domain first (never prefill the opening's URL — that audits the competitor).
  - `q` = the SERP query (active tab's `?q=` on google.com/search). `against` = `t.opening.host` (the page to beat). `from=serp` = the funnel marker.
- SaaS reads `from=serp` on the prefill landing. For this case it does **not** auto-submit (unlike a plain prefill): it shows the prefilled target + **one contextual banner** — *"You're chasing the '{q}' SERP — audit to find your gap to insert past {against}"* — and an explicit **"Audit to win this SERP"** button. The deliberate click (vs auto-submit) puts the competitive context where the user decides and avoids threading params through the redirect chain. The report's existing fix-list is then the answer.
- All params URL-encoded; the SaaS treats `q`/`against` as untrusted display strings (escape, length-cap) — banner-only, never executed.

### 3. Qualify — self-select pSEO-fit users
When the SERP is heavily templated (`t.monotony` true / templated cluster detected), the Win CTA escalates its sub-copy: *"{N} near-identical pages already rank — this is a templated SERP. pseolint is built to fill these at scale without tripping SpamBrain."* Proves the insight **and** flags programmatic ambition → the moat. Non-templated SERPs get the plain Win CTA (no escalation).

### 4. Component split
- **Extension** (`audit/internal-growth-power-ups`, local): rewritten CTA/bridge layer in `sidepanel.js` + `sidepanel.html` copy/markup for the Win/Hold CTAs. Scout logic (`teardown`, `render`) unchanged. `shared/teardown.js` may expose the `keyword`/`against` helpers if cleaner.
- **SaaS** (`main`, public): a `from=serp` context banner on the prefill landing (`landing-form.tsx` or a sibling server component) — ~one small component reading the 3 params.

### 5. Non-goals (v1)
- No auth/paywall changes; the extension stays free + open.
- No new SaaS pages; reuse the `?prefill=` audit flow + add the banner.
- No monitoring backend changes; "Watch this SERP" deep-links to the existing add-domain flow.
- No render/fetch changes in the extension (the raw-HTML snapshot ceiling stays; the hosted audit is the sound path, which is exactly what Win sends them to).
- No SERP/rank tracking. pseolint monitors *domains* (audit-state), not SERP positions — so v1 ships no "watch this SERP." A SERP-watch "hold" is a future spec, contingent on a rank-tracking capability that doesn't exist today.

## Data flow

`Google SERP → content scripts (scout) → teardown model {opening, rows, monotony, keyword} → sidepanel render → Win CTA builds context deep-link → SaaS prefill landing reads from=serp/q/against → context banner + deliberate "Audit to win" → report fix-list (the "how to win") → downstream: SaaS's existing account/monitoring upsell`.

## Error handling / edge cases

- No `userHost` set → Win CTA prompts "paste your page" inline before firing (don't send a `prefill` of the opening's URL — that audits the *competitor*).
- No `t.opening` (clean/strong SERP, no weak page) → no Win CTA; show the plain scout + a soft "audit your own site" fallback (today's behavior).
- Missing `q` (not a standard `?q=` SERP) → omit `q`/`against`; banner degrades to a generic "from a SERP scout" note.
- Untrusted strings (`host`, `q`, `against`) → `textContent`/encode only, length-capped (consistent with the extension's existing §9 "wrong badge = credibility death" discipline).

## Testing

- **Extension:** extend the existing no-framework assertion checks (`bun run test`) — the deep-link builder (correct params + encoding; the climb / insert / set-domain target selection; the no-`opening` branch) and the templated-vs-plain CTA copy selection. Pin to the `teardown` model shape.
- **SaaS:** a small test for the banner param-parse (renders on `from=serp`, escapes `q`/`against`, degrades when absent).
- **Manual:** load unpacked on a templated SERP (e.g. a `/city/service` query) → deep scan → Win CTA → confirm the landing banner + auto-audit.

## Success criteria

The extension's free brilliance stays intact (acquisition), the hot "found an opening" moment converts on the moat (not monitoring), templated SERPs self-qualify pSEO-fit users, and the hand-off feels continuous (the SaaS knows you came from a SERP scout). Measured by `from=serp` audit volume → account/monitoring conversion.
