# @pseolint/extension

## 1.0.1

### Patch Changes

- Updated dependencies [0966c22]
- Updated dependencies [6231a7e]
  - @pseolint/core@0.7.5

## 1.0.0

First public Chrome Web Store release.

### Major Changes

- Scout→Win funnel: SERP badges are now clickable and open the pseolint.dev audit
  pre-filled with position-adapted context (target URL, search query, top
  competitor) so the free extension hands off cleanly to the paid audit.
- SERP context adaptation: the overlay activates only on the Web ("All") results
  vertical and resets to a clean state on SPA navigation (new query, vertical
  switch, pagination); it stays dormant on Images/News/Shopping.
- Fixed badge rendering: verdict badges now mount inside the result `<h3>` title
  (previously collided with the ⋮ action menu and inherited a flipped transform).
- The dev-only MCP bridge (`ws://localhost:4000`, for driving the extension from a
  terminal/LLM) is compile-stripped from production builds via `--define`; `bun run
build` ships no localhost egress, `bun run build:dev` enables it locally.
- Removed a bundle leak: the service worker no longer includes the cheerio HTML
  parser (the server-only soft-404 probe moved to its own core module), keeping the
  extension truly dependency-free.

## 0.0.3

### Patch Changes

- Updated dependencies
  - @pseolint/core@0.7.4

## 0.0.2

### Patch Changes

- Updated dependencies [cc24997]
- Updated dependencies [3c9cb0d]
  - @pseolint/core@0.7.2

## 0.0.1

### Patch Changes

- Updated dependencies [d9797e4]
- Updated dependencies [ce06ef7]
  - @pseolint/core@0.7.1
