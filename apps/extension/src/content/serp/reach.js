// In-page landscape chip (reach surface, shadow DOM, §9). Informational; the
// per-result templated badges carry the funnel link. Returns the host element
// or null (no chip).
export function mountChip(text, doc = document) {
  if (!text) return null;
  const host = doc.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("style");
  style.textContent =
    ":host{all:initial;position:fixed;bottom:16px;right:16px;z-index:2147483647}" +
    ".c{font:12px/1.4 system-ui,sans-serif;background:#1a1a1a;color:#fff;" +
    "padding:6px 10px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.3)}";
  const chip = doc.createElement("div");
  chip.className = "c";
  chip.textContent = `pseolint — ${text}`; // text is our own summary, never page HTML
  root.append(style, chip);
  doc.body.appendChild(host);
  return host;
}
