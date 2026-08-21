---
"@pseolint/core": minor
---

New `content/image-attributes` rule: the parse-time half of the image blind spot, complementing `content/image-alt-text` (alt presence) and `tech/resource-weight` (image bytes under `--render`). No network access; everything comes from HTML the crawler already holds.

Two independent signals. Missing dimensions fires at warning when at least half a page's `<img>` tags declare neither width/height attributes nor inline sizing, info below that: without an aspect ratio the browser cannot reserve space, which is what Cumulative Layout Shift measures. Inline `width`, `height` or `aspect-ratio` in a style attribute counts as sized, so CSS-driven layouts are not reported as broken. Responsive candidates fires at info when a page serves three or more images and not one uses `srcset` or `<picture>`; Google recommends responsive images, so this never rises above info and the message says it is guidance rather than a requirement.

`loading="lazy"` is deliberately not checked. Lazy-loading the LCP image actively harms it, so a correct verdict needs to know which image is above the fold, which static HTML cannot say; a rule flagging missing `lazy` everywhere would be wrong exactly where it matters most. There is no documented image count, dimension or byte limit, and this rule must never grow one.
