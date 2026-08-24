# Implementation Plan: Google SERP Competitive Opportunities Analysis (Chrome Extension)

This plan details our approach to focusing the Chrome Extension strictly on competitive opportunity analysis on Google Search results pages. By removing the local "active tab audit" logic (which is already covered by the core pSEO SaaS engine), we focus the extension's browser moat entirely on auditing the organic competitor pages displayed by Google to uncover optimization gaps.

---

## Proposed Changes

### 1. Extension Manifest (`apps/extension/manifest.json`)
- Keep host permissions restricted to Google Search results (`https://www.google.com/search*`), ensuring it acts purely as a competitive wedge.

### 2. Live Page Scraper (`apps/extension/src/shared/rules-client.js`)
- Expose the boolean `hasSchema: page.hasSchema` in the `scanPage()` signal return structure to allow detecting structured data presence on competitor pages.

### 3. Competitor Opportunity Analysis (`apps/extension/src/content/serp/index.js`)
- Compute advanced opportunity flags on successfully scanned competitor pages:
  - `title rewritten`: Fired if the live page title differs significantly from the title Google displays on the SERP.
  - `no meta desc`: Fired if the live page does not contain any meta description.
  - `meta desc ignored`: Fired if the live page has a meta description, but Google ignored it and built its own snippet on the SERP.
  - `no schema`: Fired if the live page has no Schema/JSON-LD structured data.

### 4. Sidepanel Gaps Summary Dashboard (`apps/extension/sidepanel.html` & `sidepanel.js`)
- Remove the `#single-audit` card and the active page tab event listeners.
- Render the new `#serp-opportunities` (SERP Optimization Gaps) summary card in the side panel after a deep scan.
- Display a categorized bulleted list showing exactly how many competitor pages on the current SERP suffer from:
  - Title Rewrites
  - Missing Meta Descriptions
  - Ignored Meta Descriptions
  - E-E-A-T Metadata Gaps (missing author or date)
  - Missing Structured Data
  - Thin Content (< 150 words)
- Reset the sidepanel UI and disable the scan button when the user navigates away from a Google Search results tab.

---

## Verification Plan

### Automated Tests
- Run `bun run test` (in `apps/extension`) to verify parser and selection rules pass.
- Run `bun run build` to confirm extension bundles compile.

### Manual Verification
- Load the unpacked extension, search for a term on Google, click "Deep scan this SERP" in the sidepanel, and confirm that the "SERP Optimization Gaps" card populates with a detailed competitive opportunities breakdown.
