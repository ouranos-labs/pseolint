# SERP Competitive Gaps & Opportunities Analysis: Walkthrough (Chrome Extension Update)

We refactored the local developer Chrome Extension to focus entirely on **Google SERP competitive opportunity analysis**. The extension detects and summarizes optimization gaps on organic competitor search results to identify high-value entry points for new content.

---

## What Was Built

### 1. Competitive Gaps Logic
- **File**: [`rules-client.js`](file:///d:/phili/SSD_Projects/pseolint/apps/extension/src/shared/rules-client.js)
  - Exposed `hasSchema: page.hasSchema` in the parser output of `scanPage()`.
- **File**: [`index.js`](file:///d:/phili/SSD_Projects/pseolint/apps/extension/src/content/serp/index.js)
  - In `deepScan()`, added checks for extra competitive flags:
    - `"meta desc ignored"`: Triggers when a competitor page has a meta description, but Google rewrote it to generate the SERP snippet.
    - `"no schema"`: Triggers when the page lacks Schema/JSON-LD structured data.

### 2. Opportunity Summary UI
- **File**: [`sidepanel.html`](file:///d:/phili/SSD_Projects/pseolint/apps/extension/sidepanel.html)
  - Removed the `#single-audit` card and styling (formerly used for internal audits of our own pages).
  - Added the `#serp-opportunities` summary container styled with the violet opportunities theme (`#8b5cf6`).
- **File**: [`sidepanel.js`](file:///d:/phili/SSD_Projects/pseolint/apps/extension/src/ui/sidepanel.js)
  - Removed the `auditActivePage()` function and `chrome.tabs` listeners that ran audits on the active page.
  - Implemented `onTabChange()` to dynamically disable the Scan button and reset the sidepanel to a clean state if the active tab is not a Google SERP.
  - Calculated and rendered a breakdown of optimization opportunities in the `#serp-opportunities` card after a deep scan.

### 3. Unit Test Safety
- **File**: [`detect.js`](file:///d:/phili/SSD_Projects/pseolint/apps/extension/src/content/serp/detect.js)
  - Guarded `querySelector` and `closest` calls in `selectResults()` to support mock anchors in unit tests.

### 4. MCP Server Tests & Robustness
- **Dynamic Configuration Resolution**:
  - Replaced static module-level constants `MCP_SAMPLE_CAP`, `CHARACTER_LIMIT`, `JSON_TEXT_CHAR_CAP`, and `STRUCTURED_FINDINGS_CAP` in [`packages/mcp/src/server.ts`](file:///d:/phili/SSD_Projects/pseolint/packages/mcp/src/server.ts) with dynamic getter functions (`getMcpSampleCap()`, etc.) that read `process.env` dynamically. This completely resolves module caching/leakage issues in test environments without needing module reload hacks.
- **MCP Test Suite Alignments**:
  - Updated tool expectations (expecting 6 tools instead of 4) in [`packages/mcp/tests/factory.test.ts`](file:///d:/phili/SSD_Projects/pseolint/packages/mcp/tests/factory.test.ts) and [`packages/mcp/tests/server.test.ts`](file:///d:/phili/SSD_Projects/pseolint/packages/mcp/tests/server.test.ts).
  - Cleaned up Vitest's module registry using `vi.resetModules()` inside the `afterAll()` hooks of [`packages/mcp/tests/caps-env.test.ts`](file:///d:/phili/SSD_Projects/pseolint/packages/mcp/tests/caps-env.test.ts) and [`packages/mcp/tests/caps-env-invalid.test.ts`](file:///d:/phili/SSD_Projects/pseolint/packages/mcp/tests/caps-env-invalid.test.ts).
  - Set a high environment variable cap dynamically inside [`packages/mcp/tests/integration.test.ts`](file:///d:/phili/SSD_Projects/pseolint/packages/mcp/tests/integration.test.ts) to ensure the 105k character payload produced by the `airbyte_com` fixture is not truncated.

---

## Verification Results

| Check | Command / File | Status | Notes |
|---|---|---|---|
| **Extension Tests** | `bun run test` (in `apps/extension`) | ✅ **Passed** | All 10 local test suites (parse-parity, client, detect, landscape, teardown, etc.) passed cleanly. |
| **MCP Server Tests** | `bun run test` (in `packages/mcp`) | ✅ **Passed** | All 68 tests (including factory, integration, caps-env, and server) pass successfully. |
| **Workspace Build** | `bun run build` (root) | ✅ **Passed** | All 6 workspaces (core, action, mcp, extension, web, and root CLI) compiled successfully. |
