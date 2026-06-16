# pseolint browser extension

MV3 extension. Design: [`docs/extension-architecture.md`](../../docs/extension-architecture.md).

**Status:** build-sequence step 1 — `manifest.json` + service-worker skeleton.
No content scripts, no SERP overlay, no network egress yet. Intentionally.

## Load unpacked

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder (`packages/extension`).
3. The service worker should register with no permission or CSP warnings.

No build step: plain JS loads directly. A bundler arrives with the first real
code (shared types + Tier-1 rules from `@pseolint/core`), not before.
