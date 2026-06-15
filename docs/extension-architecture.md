# pseolint Browser Extension — Architecture

**Package:** `packages/extension`
**Status:** Design — not yet implemented
**License:** MIT (client) / hosted analysis remains AGPL-3.0 behind `apps/web`
**Author intent:** Top-of-funnel acquisition surface, *not* a replacement for the CLI or SaaS.

---

## 1. What this is, and what it is deliberately not

This extension exists for one reason: to put pSEO failure signals in front of SEO practitioners **in the place they already work** — the live SERP and competitor sites — without making them leave context to paste a URL into a tool.

It is a **discovery wedge and a diagnostic instrument**, not a product tier. Every design decision below flows from that. If a decision would make the extension a self-contained free tool that satisfies the user's need without ever touching the hosted product, it is the wrong decision.

### Non-goals (load-bearing — do not "improve" these later without revisiting the thesis)

- **It is not the analyzer.** Heavy analysis lives in `@pseolint/core` (CLI / server), which already has the real template, the page corpus, and `--render`. The extension never reimplements rule logic that the core owns.
- **It does not do per-URL auditing.** The product thesis is template-level linting. The extension surfaces *template-class* signals inferred from what's visible; it never degrades into "this single URL is bad."
- **It does not badge what it cannot soundly compute** from a single rendered page in a cross-site SERP context. (See §6 rule tiering.)
- **It does not ship a complete experience.** Flags without quantification, history, or multi-template breakdown are intentional. The want is created here; it is satisfied in the SaaS.
- **It does not request broad host permissions.** Ever. (See §7.)

---

## 2. The one capability that justifies its existence

A server-side "paste a domain → sitemap → screenshot" job gets the shareable artifact at a fraction of the cost and **near-zero client attack surface**. The extension is only worth its security overhead if it does the three things a server job structurally cannot:

1. **In-context triggering** — fires where the practitioner already is (live SERP, competitor tab), no context switch.
2. **Live SERP / session visibility** — overlays pSEO health onto the *actual* results page the user is viewing, including geo/personalized ranking the server can't reproduce.
3. **JS-rendered DOM** — sees the hydrated page Google indexes, not the empty server-fetch shell.

The **SERP overlay** is the wedge: health badges drawn directly onto Google results. Novel, screenshottable, lives where the audience works, and hard to copy. Everything else is supporting structure.

---

## 3. Component model

```
packages/extension/
├── manifest.json              # MV3, least-privilege (see §7)
├── src/
│   ├── background/            # Service worker — orchestration only, no DOM
│   │   ├── router.ts          # message bus between content scripts & worker
│   │   ├── client.ts          # talks to apps/web hosted API (the ONLY egress point)
│   │   └── cache.ts           # short-TTL in-memory result cache (no PII at rest)
│   ├── content/
│   │   ├── serp/              # injected ONLY on allowlisted search result hosts
│   │   │   ├── detect.ts      # recognise SERP layout, extract ranked result URLs
│   │   │   ├── overlay.ts     # shadow-DOM badge UI (see §9 injection safety)
│   │   │   └── extract.ts     # pull ONLY allowlisted signals (see §8)
│   │   └── site/              # injected on-demand via activeTab on inspected site
│   │       ├── pattern.ts     # detect templated URL pattern from current page
│   │       └── extract.ts     # rendered-page signal extraction (allowlisted)
│   ├── shared/
│   │   ├── signals.ts         # the allowlist schema — single source of truth
│   │   ├── rules-client.ts    # ONLY the rendered-single-page-sound rule subset
│   │   └── types.ts
│   └── ui/                    # popup / options — settings, auth, "open full audit"
└── tests/
```

**Hard architectural rule:** content scripts extract and render; the **service worker is the only thing that talks to the network**, and it talks to exactly one origin (the hosted API). Content scripts never make outbound requests. This keeps the exfiltration path single, auditable, and easy to reason about.

---

## 4. Technology choices (and why there is no framework)

**Decision: vanilla TypeScript against the raw MV3 APIs. No UI framework, no extension meta-framework, in the content scripts.** This is a deliberate choice, not an omission — do not "modernise" the content scripts with React/Vue later without reading this section first.

Rationale, in priority order:

- **Security posture demands it.** §9 commits to pinning and minimising dependencies because every package in the bundle runs in users' *authenticated browsers under your name*. A UI framework is exactly the dependency that argument rejects. Adding React to a content script would contradict the security thesis the rest of this document rests on.
- **The work doesn't need it.** The overlay is a handful of shadow-DOM badges built with `textContent` (§8) — tens of lines of DOM construction. There is no reconciliation, routing, or complex client state in the injected surface. A framework would be pure bundle weight and pure attack surface for zero functional gain.
- **It matches the monorepo.** The repo is TypeScript-first, built with **Bun + Turbo** as a workspace. `packages/extension` is plain TS that slots into that toolchain with no new paradigm. The Tier-1 rules import directly from `@pseolint/core` (§6) — same language, same build, one rule implementation.
- **Fail-closed rendering is simpler without a framework.** §8 requires the overlay to render nothing rather than guess when SERP layout is unrecognised. Imperative DOM construction makes "do nothing" trivial; a declarative framework adds a lifecycle you'd have to fight to get the same guarantee.

### The one sanctioned exception

The **popup / options UI** (`src/ui/`) runs in normal extension-page context, *not* injected into a host page — so the §8 injection-safety and §9 bundle-surface arguments are materially weaker there. If that surface grows genuinely stateful (auth flow, settings, rendered audit history), a **lightweight** framework scoped *only* to the popup entry point is justifiable.

Constraints if you take the exception:
- It is bundled into the popup entry point **only**. It must never reach a content script or the service worker.
- Prefer something small (Preact-class) over React-class, and pin it.
- It is an isolated, deliberate decision recorded here — not a default that creeps across the codebase.

**Default stance:** no framework anywhere until the popup specifically earns it. The content scripts and service worker are framework-free, permanently.

### Tooling summary

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript | Monorepo standard; shares types with `@pseolint/core` |
| Build / bundling | Bun + existing Turbo pipeline | No new toolchain; inherits CI (§9) |
| Manifest | MV3, hand-written | Least-privilege control (§6); no meta-framework abstracting permissions away |
| Content-script UI | Vanilla TS + shadow DOM | Minimal surface, fail-closed, security-correct (§8) |
| Popup UI | Vanilla TS by default; lightweight framework only if it earns it | Normal page context, isolated entry point |
| Rule logic | Imported from `@pseolint/core` | One implementation, never forked |

> A meta-framework like Plasmo or WXT was considered and rejected for the same reason as a UI framework: it abstracts away the manifest and permission model that §6 needs to control explicitly, and it adds build-time machinery whose output you'd have to audit against the shipped bundle anyway (§9). Hand-writing the manifest is a feature here, not a chore.

---

## 5. Two execution paths

### Path A — Instant badge (client-only, no egress)
SERP loads → `detect.ts` finds ranked result URLs → for each, run the **client-sound rule subset** (`rules-client.ts`) against signals already visible or cheaply fetchable in-page → `overlay.ts` paints a badge. No data leaves the browser. This is the "feels instant, feels magic" layer and the spread mechanic.

### Path B — Full audit (crawl-seeder → hosted core)
User clicks a badge / "run full audit" → `site/pattern.ts` (or the SERP result URL) yields a **template pattern + seed URLs** → service worker hands pattern to the hosted API → server does proper **stratified sampling (head + tail)**, runs the *full* rule set including the pairwise cannibalization and uniqueness rules the client cannot compute, applies SERP enrichment → returns the quantified audit, rendered in the SaaS surface.

Path A creates the want. Path B is the funnel into the paid product. The extension's job is to make the A→B handoff frictionless and the B output obviously worth more than A.

---

## 6. Rule tiering — what the client may badge

The canonical rule set is the published 34 rules across 6 categories. The extension splits them by **what is soundly computable from a single rendered page in a cross-site SERP context.**

### Tier 1 — Client-badgeable (Path A)
Single-page-evaluable, sound from rendered DOM + HTTP signals:
- `tech/canonical-consistency`, `tech/robots-noindex-conflict`, `tech/canonical-noindex-conflict`
- `tech/soft-404`, `tech/og-completeness`
- `spam/thin-content`, `spam/boilerplate-ratio`
- host-section-divergence heuristics (topic of section vs. host — derivable from rendered output)

### Tier 2 — Server-only (Path B)
Require a page **corpus** or true template source — structurally impossible from one SERP result:
- All pairwise rules: `spam/near-duplicate`, `cannibal/title-overlap`, `cannibal/keyword-collision`, `cannibal/url-pattern`
- `content/unique-value`, `content/meta-uniqueness`, `content/heading-uniqueness`
- `spam/entity-swap`, `spam/doorway-pattern`, `spam/template-diversity`, `spam/template-coverage`, `spam/publication-velocity`
- `links/*` (need the link graph)
- `schema/*` (cheap to check but low badge value; defer to full audit)

> **Why this split is non-negotiable:** a wrong badge on a SERP full of sites the practitioner *built themselves* is instant credibility death with this audience. Tier 1 contains only rules defensible from what the extension can actually see. Cannibalization rules stay in the canonical set but are Tier 2 because they need the within-site page set the overlay context doesn't have.

`shared/rules-client.ts` imports the Tier-1 logic from `@pseolint/core` so there is **one** implementation — the extension never forks rule logic.

---

## 7. Permission model — least privilege as a hard constraint

```jsonc
{
  "manifest_version": 3,
  "permissions": ["activeTab", "storage"],
  "host_permissions": [
    "https://www.google.com/search*"
    // add other search hosts explicitly, one at a time, each justified
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'"
  }
}
```

Rules:
- **No `<all_urls>`.** Host permissions are the search-result hosts only.
- **Inspecting an arbitrary site uses `activeTab`** — granted per user gesture on the tab they're already on, not standing access.
- **No remote code, no `eval`, no externally-hosted scripts.** Everything ships in the signed bundle. CSP enforces it.
- **Design invariant:** even if the extension's own code were fully compromised, its *permissions* must not grant read access to the user's banking, email, or Search Console. If a feature needs a permission that breaks this invariant, the feature does not ship in the extension — it goes server-side.

---

## 8. Data handling — allowlist, never blocklist

`shared/signals.ts` defines an explicit schema of the **only** fields permitted to leave the browser:

- URL path structure / detected pattern tokens
- `<head>` signals: canonical, robots meta, hreflang, og tags
- HTTP-derived: status, X-Robots-Tag, redirect hops
- Rule-relevant counts: word count, boilerplate ratio, structural hashes
- Never: raw page body, raw DOM, anything carrying session/auth context

Enforcement:
- Extraction builds a typed `SignalSet`; the service worker **rejects** transmit of any object not matching the schema. Whole-DOM is never serialised onto the wire.
- Strip-before-send pass assumes any page may be authenticated.
- TLS only; cert-pin the hosted API if practical.
- **Retention:** signals processed and discarded server-side; nothing user-identifiable at rest. State this plainly in the privacy disclosure and make the disclosure match behaviour exactly (mismatch is the #1 store-takedown cause).
- Treat scraped third-party DOM as **hostile input** — defensive parsing, never execute anything pulled from a target page.

---

## 9. Injection safety (you are writing into Google's DOM)

- Overlay renders inside a **shadow root** — host page can't read/tamper with it, your selectors can't bleed into page content.
- Build UI with `textContent` / DOM construction. **Never** `innerHTML` with interpolated data. The injected UI is your own XSS surface and it's entirely on you.
- SERP structure drifts; pin extraction to resilient selectors and **fail closed** (no badge) rather than guess when layout is unrecognised. A missing badge is fine; a wrong one is not.

---

## 10. Supply chain — the threat that actually kills solo extensions

A privileged extension with auto-update is a prime target; the documented attack is buying/phishing a small extension to push a malicious update to its install base. As a solo maintainer this lands entirely on you.

- **Chrome Web Store account on hardware-key (FIDO2) 2FA.** Not TOTP, not SMS. This account is the crown jewel.
- **Publish only from locked CI**, never from a laptop. Reproducible, signed builds; the diff between the source tag and the shipped bundle must be verifiable. Extends the existing `.github/workflows` + changesets pipeline.
- **Pin and minimise dependencies.** Every package in the bundle runs in users' authenticated browsers under your name. Lockfile committed; CVE scanning (Dependabot/Snyk) scoped to `packages/extension`.
- **Write the credential-compromise runbook before launch:** how to pull the listing, notify users, roll a clean build. Having it pre-written is the difference between an incident and a catastrophe.

---

## 11. Consent & legal

- Plain-language disclosure of what's read, when, and what's sent. Store privacy fields must match actual behaviour exactly.
- Real privacy policy; defensible GDPR/CCPA stance given EU/CA users. Minimal retention is the best legal *and* security posture.
- Background fetching of SERP-ranked sites the user didn't actively visit is closer to crawling-on-their-behalf — give it its own explicit disclosure.
- Frame output as **signals/flags, not verdicts.** "divergence flagged" not "this site is doing scaled-content abuse." Publicly screenshotting a named site's audit is spicy by design; flags are defensible, accusations invite someone's legal team.

---

## 12. Reuse from the existing monorepo

The repo already de-risks most of this:
- **Licensing split** (MIT packages / AGPL `apps/web`) maps directly: extension client = MIT package; hosted analysis stays AGPL.
- **CI / release discipline** (`.github/workflows`, changesets, 168 tests) is the publish-hardening foundation — extend, don't rebuild.
- **`--render` / CDP** proves rendered-DOM capture already lives in the core, so the extension stays a thin client and ships minimal code into the authenticated browser.

Net new work narrows to: store-publish credential hardening, the `signals.ts` exfiltration allowlist, the shadow-DOM overlay, and SERP detection/extraction.

---

## 13. Build sequence

1. `manifest.json` + service worker skeleton, single hosted-API egress point, no content scripts yet. Prove the permission model and CSP in isolation.
2. `signals.ts` schema + transmit-rejection guard. Lock the exfiltration boundary before anything extracts data.
3. SERP `detect` + `extract` + Tier-1 `rules-client` (client-only Path A). No network. Ship the instant badge.
4. Shadow-DOM `overlay`. Fail-closed rendering.
5. Path B handoff → hosted full audit → SaaS surface.
6. Harden publish pipeline (FIDO2, signed CI builds, runbook) **before** first public listing.
7. Privacy policy + store disclosures, verified against actual behaviour.

---

## 14. The decision rule this whole design rests on

Build the overlay extension **iff** you'll operate it as privileged software with your name on the auto-update channel: least-privilege permissions, hardware-key publishing, strict exfiltration allowlist, open-source client. Commit to those four and it's defensible and it's your strongest top-of-funnel asset. If any one of them feels like more than you'll sustain solo, ship the server-side sitemap-and-pic tool instead — it gets the shareable artifact with almost none of the liability, because nothing runs in the user's authenticated browser.

**Open question this build does not resolve:** the overlay is a strong answer to *silence* (discoverable, in-context, shareable) but does nothing for *indifference*. It's worth building partly *because* it's the fastest instrument to tell the two apart — engagement with the badges is itself the indifference test. But go in knowing that's the bet.
