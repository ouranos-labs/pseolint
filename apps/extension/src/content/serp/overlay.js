// pseolint extension — SERP health badge, rendered into a shadow root (§9).
//
// Injection safety (we are writing into Google's DOM):
//   - shadow root isolates our UI; the host page can't read or restyle it.
//   - any page-derived label is set via textContent, NEVER innerHTML.
//   - an unrecognised verdict renders nothing (fail closed). A missing badge is
//     fine; a wrong one is credibility death (§6).

const LEVELS = { ok: "#1a7f37", warn: "#9a6700", flag: "#cf222e" };

// Pure: verdict → { text, color }, or null when we must not badge.
export function badgeView(verdict) {
  if (!verdict || typeof verdict.label !== "string" || !verdict.label) return null;
  const color = LEVELS[verdict.level];
  if (!color) return null; // unknown level → fail closed
  return { text: verdict.label, color };
}

const STYLE =
  ":host{all:initial}" +
  ".b{display:inline-flex;align-items:center;font:12px/1.4 system-ui,sans-serif;" +
  "padding:1px 6px;border-radius:10px;color:#fff;text-decoration:none;cursor:pointer}";

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
