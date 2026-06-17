# pseolint extension — UX redesign (two-tier: reach + power)

**Date:** 2026-06-17
**Status:** Design — awaiting approval
**Supersedes UX of:** the popup-gated, single-tier Path A overlay (`apps/extension`, commits a0eb52d → 9b867aa)
**Architecture base:** `docs/extension-architecture.md` (§2 in-context thesis, §4 no-framework, §6 credibility, §7 least-privilege, §9 injection safety, §14 thin-wedge)

## 1. Problem

The shipped UX is functional but loses users at three points:

1. **Permission cliff.** The first "Scan" click triggers Chrome's worst prompt (*"read and change all your data on all websites"*) because we request `https://*/*` up front. Most first-timers bounce. This is architectural, not cosmetic.
2. **Discoverability + disconnect.** Nothing on the SERP signals the feature; the user must know to click the toolbar. Action happens in the popup; payoff (badges) appears on the page — two places.
3. **Wrong container for async work.** Deep scan fetches ~20 pages over several seconds; the **popup dismisses on blur**, so clicking back to the SERP destroys the progress/results view.
4. Secondary: no progress, no legend, "Flagged 3" is a count not an answer, partial fetch failures read as a false "all clear", and the popup looks like an unstyled prototype.

## 2. Goal

Serve **both reach and power** without compromise:

- **Reach** — value appears automatically, with **zero permission prompt**, in-context on the SERP.
- **Power** — an opt-in deep scan with rich per-result risk, in a **persistent** surface that survives the multi-second fetch.

And do it as a **thin wedge** (§2/§14): the extension surfaces signals and funnels to the SaaS; it is *not* the analyzer.

## 3. The two tiers

| | **Tier 1 — Landscape** (reach) | **Tier 2 — Deep scan** (power) |
|---|---|---|
| Trigger | **Auto** on SERP load | Explicit click in the side panel |
| Permission | **None** (reads the SERP DOM it already runs in) | `https://*/*`, requested on that click (earned) |
| Input | SERP-visible only (result URLs, hosts) | Fetches each result page (service worker) |
| Output | How *programmatic* this SERP is (descriptive) | Per-result risk verdict (thin / soft-404 / no-OG) |
| Reuses | `detect.js`, `pattern.js` | the SW fetch + core Tier-1 rules already built |

**Honesty boundary (§6).** A single templated URL is not "bad," so Tier 1 never claims per-result *risk* from a URL alone. It states a sound, SERP-level fact: across the visible results, N are templated and how concentrated (same host/pattern repeated — the siblings are right there on the SERP, so saturation is genuinely sound). **Risk verdicts only appear after a fetch (Tier 2).**

## 4. Surfaces

Three surfaces, each earning its place. **No popup.**

### 4.1 In-page (auto, zero-permission) — the reach surface
- Content script already injects on `https://www.google.com/search*`. On load it runs Tier-1 analysis (no network, no permission) and renders, in a shadow root (§9):
  - a subtle neutral **"templated"** marker only on results that belong to a **templated cluster** (≥2 visible results sharing host + URL pattern) — that grouping is the sound signal, and it avoids marking a lone templated-looking URL;
  - a small fixed **landscape chip**: e.g. *"pseolint — 6/10 results templated · 3 hosts."*
- The chip and each marker **funnel to the hosted audit** via the Path B deep link (`pseolint.dev/?prefill=`) — zero permission.
- It does **not** open the side panel (content scripts can't call `chrome.sidePanel.open`); discovery of the power tier is the toolbar icon.

### 4.2 Side panel (toolbar-opened) — the power surface
- Replaces the popup. `chrome.sidePanel` with `setPanelBehavior({ openPanelOnActionClick: true })` so the toolbar icon opens it directly.
- Persistent across SERP clicks and the whole deep scan. Contents:
  - the same landscape summary;
  - **Deep scan this SERP** button → `permissions.request({origins:["https://*/*"]})` (valid gesture — side panel is an extension page) → tells the content script's SW path to fetch + judge;
  - **live progress** ("scanning 12/20…"), **honest coverage** ("18/20 · 2 timed out");
  - a **results list**: host · verdict chip · "full audit ↗" link per flagged result;
  - top-level "Open full audit" funnel to the SaaS.
- **Thin, not a dashboard (§2/§14):** no per-template breakdowns, trends, or charts — those are the SaaS (deep link), not a rebuild.

### 4.3 Badges on results — the shared inline payoff
- Self-contained, shadow-DOM, `textContent` never `innerHTML` (§9): **color** = severity, **label** = what, **hover/title** = why, **click** = full audit (Path B).
- Tier-1 = neutral "templated" chip; Tier-2 = amber/red risk badge. Inserted as a sibling after the result link (never inside it) so the click opens our audit, not the result.

## 5. Data flow & messaging

- **Content script** (`content/serp/`): on load → Tier-1 analyze + render reach surface. Listens for `pseolint:deep-scan` (from side panel) → detect URLs → ask SW to fetch+judge → mount Tier-2 badges → reply with results+coverage for the side-panel list. Listens for `pseolint:landscape` (side panel asking for the current summary).
- **Service worker** (`background.js`): unchanged role — sole network egress; on `pseolint:scan {urls}` fetches each (credentials omitted), parses (regex, no DOM), runs core rules, returns `{url, verdict}` + per-url fetch status (for coverage). Sets the side-panel behavior on install.
- **Side panel** (`ui/sidepanel.*`): owns the deep-scan gesture + permission, renders progress/list/coverage, deep-links to the SaaS. Talks to the active tab's content script via `chrome.tabs.sendMessage` (activeTab).

## 6. Permissions / manifest

- **Add** `"side_panel": { "default_path": "sidepanel.html" }` + `"sidePanel"` permission.
- **Drop** `action.default_popup` (keep `action` for the icon/title; toolbar opens the side panel).
- **Keep** `activeTab` (side panel → content script messaging), `optional_host_permissions: ["https://*/*"]` (deep scan), `content_scripts` (google.com/search), CSP.
- Net permission story stays least-privilege: the **default experience requests nothing**; broad host access is gesture-granted only when a user clicks Deep scan.

## 7. Visual design (produced in implementation via `frontend-design` + `ui-ux-pro-max`)

The spec fixes *intent + constraints*; the actual visual system (layout, type scale, color, spacing, states, motion) is produced during implementation with those skills, then locked against live renders (chrome-devtools).

- **Brand-aligned** with pseolint.dev (dark control surfaces, the existing risk palette: success/ warn/ flag; the wordmark + logo we ship in `icons/`).
- **In-page surfaces stay vanilla + shadow-DOM** (§4/§9) — minimal, fail-closed, non-intrusive on Google's page.
- **Side panel stays vanilla** (§4): a results list + progress doesn't earn a framework. Revisit only if it grows genuinely stateful.
- **States to design explicitly:** loading/progress, empty ("clean SERP"), partial-coverage, error/permission-denied, not-a-SERP, and a **badge legend** (what amber/red/templated/↗ mean).
- Accessibility basics: contrast, focus states, keyboard-operable side panel, `aria` on interactive chips.

## 8. Reuse vs new

- **Reuse:** `detect.js`, `pattern.js`, `overlay.js` (badge, extended for the templated chip), the SW fetch + `rules-client.js` + `parse.js`, `parse-parity` guard, Path B deep link, `client.js`/`signals.js` (still reserved).
- **New:** a Tier-1 SERP-only analysis module (saturation from `detect`+`pattern`), the in-page landscape surface, the side panel (replaces popup), auto-run wiring, coverage reporting from the SW.
- **Removed:** `popup.html` + `ui/popup.js`.

## 9. Non-goals

- No automatic fetching (Tier 2 is always an explicit opt-in — also the §11 "we fetch on your behalf" consent).
- No SaaS-dashboard clone in the side panel.
- No UI framework anywhere yet (§4).
- No new server endpoint (Path B stays a deep link).

## 10. Testing

- **Pure units, runnable `node` checks** (repo convention): Tier-1 saturation analysis (results[] → summary), badge view (incl. templated variant), URL/selection logic, parser + parity — extend existing suites.
- **Coverage logic** (SW returns fetched/failed counts) gets a unit check so a false "all clear" can't regress.
- **Live verification** via chrome-devtools: reach surface auto-renders on a real SERP; side panel opens, deep scan runs, badges paint, coverage reports. Selector already verified live (2026-06-16).

## 11. Phasing (for the implementation plan)

1. Tier-1 analysis module + in-page reach surface (auto, zero-perm) + the "templated" badge variant. Ship reach end-to-end first.
2. Side panel scaffold + toolbar-opens-panel + Deep scan gesture/permission + progress/coverage/list, reusing the SW fetch. Remove the popup.
3. Visual revamp pass (`frontend-design` + `ui-ux-pro-max`) across all three surfaces + states + legend; lock against live renders.
4. Update PRIVACY.md / STORE.md to the two-tier behavior; refresh README.
