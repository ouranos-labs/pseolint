---
"@pseolint/core": minor
---

Render mode: `render.browserProxy` (or `PSEOLINT_BROWSER_PROXY`) routes the remote browser's traffic through an HTTP egress proxy, so rendered pages can't reach private networks. Plain `ws://` endpoints are now also accepted for private service names (e.g. `ws://browserless:3000`).
