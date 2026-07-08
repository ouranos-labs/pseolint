// In-page landscape chip (reach surface, shadow DOM, §9). Informational; the
// per-result templated badges carry the funnel link. Returns the host element
// or null (no chip). Brand-aligned (pseolint.dev dark surface + emerald dot) but
// deliberately restrained — it sits on Google's page.
export function mountChip(text, doc = document) {
  // Single chip, ever: drop any prior one first so re-runs don't stack duplicates
  // and an empty text (nothing templated / reset) just clears it.
  for (const old of doc.querySelectorAll('[data-pseolint="chip"]')) old.remove();
  if (!text) return null;
  const host = doc.createElement("div");
  host.setAttribute("data-pseolint", "chip");
  const root = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("style");
  style.textContent =
    ":host{all:initial;position:fixed;bottom:18px;right:18px;z-index:2147483647}" +
    ".c{display:inline-flex;align-items:center;gap:7px;font:500 12px/1.4 ui-sans-serif,system-ui,sans-serif;" +
    "background:#14171c;color:#f1f4f8;border:1px solid #262b33;padding:7px 12px;border-radius:10px;" +
    // neo-neumorphism (apps/web card insets) + a floating drop, since it sits on Google
    "box-shadow:inset 0 1px 0 0 rgba(255,255,255,.06),inset 0 -1.5px 0 0 rgba(0,0,0,.25),0 8px 24px 0 rgba(0,0,0,.4)}" +
    ".d{width:6px;height:6px;border-radius:50%;background:#36d39a;box-shadow:0 0 7px #36d39a;flex:none}";
  const chip = doc.createElement("div");
  chip.className = "c";
  const dot = doc.createElement("span");
  dot.className = "d";
  const label = doc.createElement("span");
  label.textContent = `pseolint · ${text}`; // text is our own summary, never page HTML
  chip.append(dot, label);
  root.append(style, chip);
  doc.body.appendChild(host);
  return host;
}
