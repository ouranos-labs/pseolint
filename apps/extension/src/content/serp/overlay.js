// pseolint extension — SERP health badge, rendered into a shadow root (§9).
//
// Injection safety (we are writing into Google's DOM):
//   - shadow root isolates our UI; the host page can't read or restyle it.
//   - any page-derived label is set via textContent, NEVER innerHTML.
//   - an unrecognised verdict renders nothing (fail closed). A missing badge is
//     fine; a wrong one is credibility death (§6).

// Brand-aligned risk palette (pseolint.dev tokens): emerald success, amber
// warning, red destructive; neutral slate for the descriptive "templated" marker.
const LEVELS = { ok: "#36d39a", warn: "#fbb337", flag: "#df3a3a", templated: "#586474" };
// Foreground per level (dark text on bright fills, white on dark fills).
const FG = { ok: "#06281d", warn: "#3a2a06", flag: "#ffffff", templated: "#ffffff" };

// Pure: verdict → { text, color }, or null when we must not badge.
export function badgeView(verdict) {
  if (!verdict || typeof verdict.label !== "string" || !verdict.label) return null;
  const color = LEVELS[verdict.level];
  if (!color) return null; // unknown level → fail closed
  return { text: verdict.label, color };
}

const STYLE =
  ":host{all:initial}" +
  ".b{display:inline-flex;align-items:center;font:600 11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;" +
  "letter-spacing:.02em;margin-left:6px;padding:1px 7px;border-radius:7px;vertical-align:middle;" +
  "text-decoration:none;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.25)}";

// Build the shadow-host element for a verdict, or null (no badge). Glue only —
// the decision lives in badgeView; this just plumbs it into a closed shadow root.
// When `href` is given the badge is a link to the hosted full audit (Path B, §5):
// it's OUR constructed URL (never page-derived) set via .href, not innerHTML, so
// the §9 injection-safety contract holds.
export function mountBadge(verdict, doc = document, href = null) {
  const view = badgeView(verdict);
  if (!view) return null;

  const host = doc.createElement("span");
  const root = host.attachShadow({ mode: "closed" }); // host page can't reach in

  const style = doc.createElement("style");
  style.textContent = STYLE; // our own static CSS, no interpolation

  const badge = doc.createElement(href ? "a" : "span");
  badge.className = "b";
  badge.style.background = view.color;
  badge.style.color = FG[verdict.level] ?? "#ffffff";
  badge.textContent = href ? `${view.text} ↗` : view.text; // label via textContent, never innerHTML
  if (href) {
    badge.href = href;
    badge.target = "_blank";
    badge.rel = "noopener noreferrer";
    badge.title = "Open the full pseolint audit";
  }

  root.append(style, badge);
  return host;
}
