// In-page landscape chip (reach surface, shadow DOM, §9). Informational; the
// per-result templated badges carry the funnel link. Returns the host element
// or null (no chip). Brand-aligned (pseolint.dev dark surface + emerald dot) but
// deliberately restrained — it sits on Google's page.
export function mountChip(text, doc = document) {
  if (!text) return null;
  const host = doc.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("style");
  style.textContent =
    ":host{all:initial;position:fixed;bottom:18px;right:18px;z-index:2147483647}" +
    ".c{display:inline-flex;align-items:center;gap:7px;font:500 12px/1.4 ui-sans-serif,system-ui,sans-serif;" +
    "background:#14171c;color:#f1f4f8;border:1px solid #262b33;padding:7px 12px;border-radius:10px;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.4)}" +
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
