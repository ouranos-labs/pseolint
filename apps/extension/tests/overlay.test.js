// Runnable check for the overlay's §9 safety contract. `bun tests/overlay.test.js`.
// Visual rendering needs Chrome; here we verify the invariants with a fake DOM
// that TRAPS innerHTML: the test fails loudly if anyone ever reaches for it.
import assert from "node:assert";
import { badgeView, mountBadge } from "../src/content/serp/overlay.js";

// The fake element grows properties as the code under test sets them
// (`shadowMode`, `shadow`), which is the point of the double, so it is `any`
// rather than a partial HTMLElement.
/** @returns {any} */
function makeEl(tag, created) {
  const el = { tag, className: "", style: {}, children: [], textSets: [], attrs: {}, listeners: {},
    attachShadow(opts) { el.shadowMode = opts.mode; el.shadow = makeEl("#root", created); return el.shadow; },
    append(...n) { el.children.push(...n); },
    setAttribute(k, v) { el.attrs[k] = v; },
    addEventListener(type, fn) { el.listeners[type] = fn; } };
  Object.defineProperty(el, "textContent", { set(v) { el.textSets.push(v); }, get() { return el.textSets.at(-1); } });
  Object.defineProperty(el, "innerHTML", { set() { throw new Error("§9 violation: innerHTML used"); }, get() { return ""; } });
  created.push(el);
  return el;
}
// Stands in for `document`: implements createElement and nothing else.
/** @type {() => any} */
const fakeDoc = () => { const created = []; return { created, createElement: (t) => makeEl(t, created) }; };

// badgeView fail-closed cases.
assert.strictEqual(badgeView(null), null, "no verdict");
assert.strictEqual(badgeView({ level: "flag", label: "" }), null, "empty label");
assert.strictEqual(badgeView({ level: "flag" }), null, "missing label");
assert.strictEqual(badgeView({ level: "bogus", label: "x" }), null, "unknown level");
assert.deepStrictEqual(badgeView({ level: "warn", label: "2 flags" }), { text: "2 flags", color: "#fbb337" });
assert.deepStrictEqual(badgeView({ level: "templated", label: "templated" }), { text: "templated", color: "#586474" }, "neutral templated level");

// Fail closed → no badge AND nothing created.
let doc = fakeDoc();
assert.strictEqual(mountBadge({ level: "nope", label: "x" }, doc), null);
assert.strictEqual(doc.created.length, 0, "rejected verdict creates no elements");

// Happy path: closed shadow root, label via textContent, innerHTML never touched.
doc = fakeDoc();
const host = /** @type {any} */ (mountBadge({ level: "flag", label: "3 flags" }, doc)); // label could be page-derived
assert.ok(host, "host element returned");
assert.strictEqual(host.shadowMode, "closed", "shadow root is closed");
const badge = doc.created.find((e) => e.className === "b");
assert.strictEqual(badge.textSets.at(-1), "3 flags", "label set via textContent");
assert.strictEqual(badge.style.background, "#df3a3a", "level colour applied");
assert.strictEqual(badge.tag, "span", "non-clickable badge is a span");

// Clickable variant (Path B): href → a SPAN badge (never an <a>; it nests inside
// the result's <h3>/<a>) with a click handler that opens the audit URL, label via
// textContent (+ ↗ hint), role=link for a11y.
doc = fakeDoc();
let opened = null;
globalThis.window = /** @type {any} */ ({ open: (u) => { opened = u; } });
const linked = mountBadge({ level: "warn", label: "thin" }, doc, "https://pseolint.dev/?prefill=https%3A%2F%2Fx.com");
const span = doc.created.find((e) => e.tag === "span" && e.className === "b");
assert.ok(span, "clickable badge is a span (nests legally inside the result link)");
assert.strictEqual(span.attrs.role, "link", "role=link for a11y");
assert.strictEqual(span.textSets.at(-1), "thin ↗", "label via textContent with ↗ hint");
assert.ok(span.listeners.click, "click handler registered");
span.listeners.click({ preventDefault() {}, stopPropagation() {} });
assert.strictEqual(opened, "https://pseolint.dev/?prefill=https%3A%2F%2Fx.com", "click opens the audit URL, not the result");
assert.ok(linked, "host returned for clickable badge");

console.log("overlay: all safety checks passed");
