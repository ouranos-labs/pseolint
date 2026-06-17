// Runnable check for the overlay's §9 safety contract. `bun tests/overlay.test.js`.
// Visual rendering needs Chrome; here we verify the invariants with a fake DOM
// that TRAPS innerHTML — the test fails loudly if anyone ever reaches for it.
import assert from "node:assert";
import { badgeView, mountBadge } from "../src/content/serp/overlay.js";

function makeEl(tag, created) {
  const el = { tag, className: "", style: {}, children: [], textSets: [],
    attachShadow(opts) { el.shadowMode = opts.mode; el.shadow = makeEl("#root", created); return el.shadow; },
    append(...n) { el.children.push(...n); } };
  Object.defineProperty(el, "textContent", { set(v) { el.textSets.push(v); }, get() { return el.textSets.at(-1); } });
  Object.defineProperty(el, "innerHTML", { set() { throw new Error("§9 violation: innerHTML used"); }, get() { return ""; } });
  created.push(el);
  return el;
}
const fakeDoc = () => { const created = []; return { created, createElement: (t) => makeEl(t, created) }; };

// badgeView fail-closed cases.
assert.strictEqual(badgeView(null), null, "no verdict");
assert.strictEqual(badgeView({ level: "flag", label: "" }), null, "empty label");
assert.strictEqual(badgeView({ level: "flag" }), null, "missing label");
assert.strictEqual(badgeView({ level: "bogus", label: "x" }), null, "unknown level");
assert.deepStrictEqual(badgeView({ level: "warn", label: "2 flags" }), { text: "2 flags", color: "#9a6700" });
assert.deepStrictEqual(badgeView({ level: "templated", label: "templated" }), { text: "templated", color: "#0969da" }, "neutral templated level");

// Fail closed → no badge AND nothing created.
let doc = fakeDoc();
assert.strictEqual(mountBadge({ level: "nope", label: "x" }, doc), null);
assert.strictEqual(doc.created.length, 0, "rejected verdict creates no elements");

// Happy path: closed shadow root, label via textContent, innerHTML never touched.
doc = fakeDoc();
const host = mountBadge({ level: "flag", label: "3 flags" }, doc); // label could be page-derived
assert.ok(host, "host element returned");
assert.strictEqual(host.shadowMode, "closed", "shadow root is closed");
const badge = doc.created.find((e) => e.className === "b");
assert.strictEqual(badge.textSets.at(-1), "3 flags", "label set via textContent");
assert.strictEqual(badge.style.background, "#cf222e", "level colour applied");
assert.strictEqual(badge.tag, "span", "non-clickable badge is a span");

// Clickable variant (Path B): href → an <a> badge, href set via property (not
// innerHTML), opens a new tab, label still via textContent (+ ↗ hint).
doc = fakeDoc();
const linked = mountBadge({ level: "warn", label: "thin" }, doc, "https://pseolint.dev/?prefill=https%3A%2F%2Fx.com");
const a = doc.created.find((e) => e.tag === "a" && e.className === "b");
assert.ok(a, "badge is an anchor when href given");
assert.strictEqual(a.href, "https://pseolint.dev/?prefill=https%3A%2F%2Fx.com", "audit href set");
assert.strictEqual(a.target, "_blank", "opens a new tab");
assert.strictEqual(a.rel, "noopener noreferrer", "rel hardened");
assert.strictEqual(a.textSets.at(-1), "thin ↗", "label via textContent with hint");
assert.ok(linked, "host returned for clickable badge");

console.log("overlay: all safety checks passed");
