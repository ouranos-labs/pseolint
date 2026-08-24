# Commit, CLI Polish, and GitHub Action: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commit all current work, add 4 CLI flags (concurrency, timeout, sampleSize, ignore), and implement the GitHub Action that posts PR comments.

**Architecture:** Three independent workstreams. Task 1 commits and verifies CI. Tasks 2-5 add CLI options by threading new fields through types → auditor → CLI → config. Tasks 6-8 implement the GitHub Action with PR comment posting and a release workflow.

**Tech Stack:** TypeScript, Commander, cosmiconfig, zod, @actions/core, @actions/github, @vercel/ncc

---

### Task 1: Commit all current work

**Files:**
- All uncommitted files (42 files: see `git status`)

- [ ] **Step 1: Stage all changes**

```bash
cd D:/phili/SSD_Projects/pseolint
git add packages/core/src packages/core/tests packages/cli/src packages/cli/package.json docs/superpowers
git add -u  # stage deletions (.gitkeep files)
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: complete 30-rule engine with formatters, CLI, and bug fixes

- Add 12 missing rules: schema/* (3), cannibal/* (3), content/missing-author,
  content/eeat-signals, plus TF-IDF algorithm
- Add 4 output formatters: console, json, markdown, html
- Rewrite CLI with Commander, cosmiconfig, zod config loading
- Fix parser link extraction order (links before nav/header removal)
- Fix near-duplicate/entity-swap SimHash precomputation
- Fix boilerplate-ratio to use sentence-level blocks, not individual words
- Fix hreflang-consistency to check reciprocity (A→B requires B→A)
- Fix doorway-pattern to check 5 signals (was 3)
- Add concurrency control and per-page error handling for HTTP fetching
- Add categoryScores to AuditSummary
- 98 tests across 21 files, all passing

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Verify tests pass from clean state**

Run: `bun run test`
Expected: 98 tests, 21 files, all passing.

---

### Task 2: Add `concurrency`, `timeout`, `sampleSize`, `ignore` to AuditOptions

**Files:**
- Modify: `packages/core/src/types.ts`
- Test: existing tests still pass (no new test file needed: these are plumbing)

- [ ] **Step 1: Add fields to AuditOptions**

In `packages/core/src/types.ts`, add these fields to `AuditOptions` after the `rules` property:

```typescript
export interface AuditOptions {
  rules?: {
    // ... existing fields unchanged ...
  };
  /** Max parallel HTTP fetches when auditing a remote sitemap (default: 5). */
  concurrency?: number;
  /** Per-request timeout in milliseconds (default: 30000). */
  timeout?: number;
  /** Audit a random subset of N pages. 0 means all pages (default: 0). */
  sampleSize?: number;
  /** URL/path glob patterns to exclude from the audit. */
  ignore?: string[];
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/core && bun run build`
Expected: success (new optional fields don't break anything).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add concurrency, timeout, sampleSize, ignore to AuditOptions

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire options into auditor.ts

**Files:**
- Modify: `packages/core/src/auditor.ts`
- Test: `packages/core/tests/integration/auditor.test.ts`

- [ ] **Step 1: Write tests for the new options**

Add these tests to the end of the `describe("auditSource", ...)` block in `packages/core/tests/integration/auditor.test.ts`:

```typescript
test("respects ignore patterns to exclude matching pages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pseolint-ignore-"));
  tempDirs.push(dir);

  const pageHtml = `<html><body><h1>Page</h1><p>${"word ".repeat(300)}</p></body></html>`;
  const apiHtml = `<html><body><h1>API</h1><p>${"api ".repeat(300)}</p></body></html>`;

  const apiDir = join(dir, "api");
  await mkdir(apiDir, { recursive: true });
  await writeFile(join(dir, "index.html"), pageHtml, "utf-8");
  await writeFile(join(apiDir, "endpoint.html"), apiHtml, "utf-8");

  const summary = await auditSource(dir, { ignore: ["**/api/**"] });
  expect(summary.pageCount).toBe(1);
});

test("respects sampleSize to limit audited pages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pseolint-sample-"));
  tempDirs.push(dir);

  for (let i = 0; i < 10; i += 1) {
    await writeFile(
      join(dir, `page-${i}.html`),
      `<html><body><h1>Page ${i}</h1><p>${`unique${i} `.repeat(300)}</p></body></html>`,
      "utf-8"
    );
  }

  const summary = await auditSource(dir, { sampleSize: 3 });
  expect(summary.pageCount).toBe(3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && bun run test`
Expected: the 2 new tests fail (options not wired yet).

- [ ] **Step 3: Add glob matcher and sampling to auditor.ts**

Add this function after the `isSitemapIndex` function (around line 212):

```typescript
function matchGlob(pattern: string, value: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/\\\\]*")
    .replace(/\0/g, ".*");
  return new RegExp(`^${regexStr}$`).test(value);
}

function shouldIgnore(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  for (const pattern of patterns) {
    if (matchGlob(pattern, url)) return true;
  }
  return false;
}

function fisherYatesSample<T>(items: T[], n: number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0 && arr.length - i <= n; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(arr.length - n);
}
```

- [ ] **Step 4: Wire concurrency and timeout into fetch functions**

Replace the `fetchWithRetry` and `fetchTextStrict` signatures to accept a timeout parameter:

```typescript
async function fetchWithRetry(
  url: string,
  timeoutMs: number
): Promise<{ text: string; contentType: string } | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      return null;
    }
    return {
      text: await response.text(),
      contentType: response.headers.get("content-type")?.toLowerCase() ?? ""
    };
  } catch {
    return null;
  }
}

async function fetchTextStrict(url: string, timeoutMs: number): Promise<{ text: string; contentType: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`Failed to fetch source: ${response.status} ${response.statusText}`);
  }
  return {
    text: await response.text(),
    contentType: response.headers.get("content-type")?.toLowerCase() ?? ""
  };
}
```

Update `collectUrlsFromSitemap` to pass timeout:

```typescript
async function collectUrlsFromSitemap(
  sitemapText: string,
  sitemapUrl: string,
  visited: Set<string>,
  timeoutMs: number
): Promise<string[]> {
  visited.add(sitemapUrl);
  const locs = parseSitemapUrls(sitemapText);

  if (!isSitemapIndex(sitemapText)) {
    return locs;
  }

  const allUrls: string[] = [];
  for (const childUrl of locs) {
    if (visited.has(childUrl)) continue;
    const child = await fetchWithRetry(childUrl, timeoutMs);
    if (!child) continue;
    const childLike = child.contentType.includes("xml") || looksLikeSitemap(child.text);
    if (!childLike) continue;
    const childUrls = await collectUrlsFromSitemap(child.text, childUrl, visited, timeoutMs);
    allUrls.push(...childUrls);
  }
  return allUrls;
}
```

Update `loadPagesFromSource` to accept concurrency and timeout:

```typescript
async function loadPagesFromSource(
  source: string,
  concurrency: number,
  timeoutMs: number
): Promise<LoadedPage[]> {
```

And update the two call sites inside it:
- `await fetchTextStrict(source)` → `await fetchTextStrict(source, timeoutMs)`
- `await fetchWithRetry(url)` → `await fetchWithRetry(url, timeoutMs)`
- `await runWithConcurrency(urls, DEFAULT_CONCURRENCY, ...)` → `await runWithConcurrency(urls, concurrency, ...)`

- [ ] **Step 5: Wire ignore and sampleSize in auditSource**

At the top of `auditSource`, resolve the new options:

```typescript
const concurrency = options?.concurrency ?? 5;
const timeoutMs = options?.timeout ?? 30000;
const ignorePatterns = options?.ignore ?? [];
const sampleSize = options?.sampleSize ?? 0;
```

Update the `loadPagesFromSource` call:

```typescript
const loadedPages = await loadPagesFromSource(source, concurrency, timeoutMs);
```

After the dedup loop (after line 342 in current file), add ignore filtering:

```typescript
const filtered = ignorePatterns.length > 0
  ? deduped.filter((page) => !shouldIgnore(page.url, ignorePatterns))
  : deduped;
```

After filtering, add sampling:

```typescript
const sampled = sampleSize > 0 && sampleSize < filtered.length
  ? fisherYatesSample(filtered, sampleSize)
  : filtered;
```

Then change `const parsedPages = deduped.map(...)` to use `sampled`:

```typescript
const parsedPages = sampled.map((page) =>
  parseHtmlPage(page.html, page.url, { normalizeUrl: normalizeUrlOptions })
);
```

- [ ] **Step 6: Run tests**

Run: `cd packages/core && bun run test`
Expected: all 100 tests pass (98 old + 2 new).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/auditor.ts packages/core/tests/integration/auditor.test.ts
git commit -m "feat(core): wire concurrency, timeout, sampleSize, ignore into auditor

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add new CLI flags

**Files:**
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1: Add Commander options and CliOptions fields**

Add to the `CliOptions` interface:

```typescript
interface CliOptions {
  format: FormatType;
  threshold: string;
  output?: string;
  color: boolean;
  concurrency: string;
  timeout: string;
  sampleSize: string;
  ignore?: string;
}
```

Add Commander options after `--no-color`:

```typescript
    .option("--concurrency <n>", "Max parallel HTTP fetches", "5")
    .option("--timeout <ms>", "Per-request timeout in ms", "30000")
    .option("--sample-size <n>", "Audit a random subset of N pages", "0")
    .option("--ignore <patterns>", "Comma-separated glob patterns to exclude");
```

- [ ] **Step 2: Pass parsed flags to mergeOptions**

Replace the `mergeOptions` call with explicit flag extraction:

```typescript
  const cliFlags = {
    concurrency: opts.concurrency !== "5" ? Number(opts.concurrency) : undefined,
    timeout: opts.timeout !== "30000" ? Number(opts.timeout) : undefined,
    sampleSize: opts.sampleSize !== "0" ? Number(opts.sampleSize) : undefined,
    ignore: opts.ignore ? opts.ignore.split(",").map((s: string) => s.trim()) : undefined,
  };

  const options = mergeOptions(configFile, cliFlags);
```

- [ ] **Step 3: Verify build**

Run: `cd packages/cli && bun run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/cli.ts
git commit -m "feat(cli): add --concurrency, --timeout, --sample-size, --ignore flags

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Update config.ts to merge CLI flags

**Files:**
- Modify: `packages/cli/src/config.ts`

- [ ] **Step 1: Add new fields to zod schema and rewrite mergeOptions**

Replace the entire file content:

```typescript
import { cosmiconfig } from "cosmiconfig";
import { z } from "zod";
import type { AuditOptions } from "@pseolint/core";

const rulesSchema = z
  .object({
    stripUrlQuery: z.boolean().optional(),
    stripWwwHost: z.boolean().optional(),
    nearDuplicateThreshold: z.number().optional(),
    entitySwapThreshold: z.number().optional(),
    thinContentMinWords: z.number().optional(),
    publicationVelocityMaxPerDay: z.number().optional(),
    boilerplateMaxRatio: z.number().optional(),
    templateDiversityMinUniqueRatio: z.number().optional(),
    uniqueValueMinWords: z.number().optional(),
    metaUniquenessMinJaccard: z.number().optional(),
    linkDepthMaxClicks: z.number().optional(),
    hubPagesMinSiblings: z.number().optional(),
    hubPagesMaxSiblings: z.number().optional(),
    titleOverlapThreshold: z.number().optional(),
    keywordCollisionMinShared: z.number().optional(),
  })
  .optional();

const auditOptionsSchema = z.object({
  rules: rulesSchema,
  concurrency: z.number().optional(),
  timeout: z.number().optional(),
  sampleSize: z.number().optional(),
  ignore: z.array(z.string()).optional(),
});

export async function loadConfig(): Promise<AuditOptions> {
  const explorer = cosmiconfig("pseolint");
  const result = await explorer.search();

  if (!result || result.isEmpty) {
    return {};
  }

  const parsed = auditOptionsSchema.parse(result.config);
  return parsed;
}

export interface CliFlags {
  concurrency?: number;
  timeout?: number;
  sampleSize?: number;
  ignore?: string[];
}

export function mergeOptions(
  configFile: AuditOptions,
  cliFlags: CliFlags,
): AuditOptions {
  const result = { ...configFile };
  if (cliFlags.concurrency !== undefined) result.concurrency = cliFlags.concurrency;
  if (cliFlags.timeout !== undefined) result.timeout = cliFlags.timeout;
  if (cliFlags.sampleSize !== undefined) result.sampleSize = cliFlags.sampleSize;
  if (cliFlags.ignore !== undefined) result.ignore = cliFlags.ignore;
  return result;
}
```

- [ ] **Step 2: Update cli.ts import to use CliFlags type**

In `packages/cli/src/cli.ts`, change the import:

```typescript
import { loadConfig, mergeOptions } from "./config.js";
```

to:

```typescript
import type { CliFlags } from "./config.js";
import { loadConfig, mergeOptions } from "./config.js";
```

And update the cliFlags variable to be typed:

```typescript
  const cliFlags: CliFlags = {
    concurrency: opts.concurrency !== "5" ? Number(opts.concurrency) : undefined,
    timeout: opts.timeout !== "30000" ? Number(opts.timeout) : undefined,
    sampleSize: opts.sampleSize !== "0" ? Number(opts.sampleSize) : undefined,
    ignore: opts.ignore ? opts.ignore.split(",").map((s: string) => s.trim()) : undefined,
  };
```

- [ ] **Step 3: Build both packages**

Run: `bun run build`
Expected: all packages build successfully.

- [ ] **Step 4: Run all tests**

Run: `bun run test`
Expected: 100 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/config.ts packages/cli/src/cli.ts
git commit -m "feat(cli): wire config merging for new audit options

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Implement GitHub Action

**Files:**
- Modify: `packages/action/package.json`
- Modify: `packages/action/src/index.ts`
- Modify: `packages/action/action.yml`

- [ ] **Step 1: Install action dependencies**

```bash
cd packages/action && bun add @actions/core @actions/github @pseolint/core@workspace:*
bun add -d @vercel/ncc
```

Then remove the old `pseolint` dependency from `packages/action/package.json` if it exists. The `dependencies` section should have:

```json
{
  "dependencies": {
    "@actions/core": "latest",
    "@actions/github": "latest",
    "@pseolint/core": "workspace:*"
  },
  "devDependencies": {
    "@vercel/ncc": "latest"
  }
}
```

Add a build script:

```json
{
  "scripts": {
    "build": "ncc build src/index.ts -o dist --source-map --license licenses.txt",
    "lint": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

- [ ] **Step 2: Update action.yml with defaults**

Replace `packages/action/action.yml`:

```yaml
name: "pSEO Lint"
description: "Run pseolint against your generated site output and post results on PRs."
inputs:
  source:
    description: "Build output directory or sitemap URL"
    required: true
  threshold:
    description: "Score threshold for check failure (default: 40)"
    required: false
    default: "40"
  token:
    description: "GitHub token for PR comments (defaults to github.token)"
    required: false
    default: ${{ github.token }}
runs:
  using: "node20"
  main: "dist/index.js"
```

- [ ] **Step 3: Implement the action**

Replace `packages/action/src/index.ts` with:

```typescript
import * as core from "@actions/core";
import * as github from "@actions/github";
import { auditSource } from "@pseolint/core";
import type { AuditSummary, Severity } from "@pseolint/core";

const COMMENT_MARKER = "<!-- pseolint-report -->";
const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

function scoreLabel(score: number): string {
  if (score <= 20) return "Safe";
  if (score <= 40) return "Caution";
  if (score <= 60) return "Risky";
  if (score <= 80) return "Dangerous";
  return "Critical";
}

function formatPrComment(summary: AuditSummary): string {
  const lines: string[] = [COMMENT_MARKER];

  lines.push(`## pSEO Lint, Score: ${summary.score}/100 (${scoreLabel(summary.score)})`);
  lines.push("");
  lines.push(`**Pages analysed:** ${summary.pageCount}`);
  lines.push("");

  lines.push("| Category | Score |");
  lines.push("|----------|------:|");
  for (const [name, value] of Object.entries(summary.categoryScores)) {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(`| ${label} | ${value} |`);
  }
  lines.push("");

  const grouped = new Map<Severity, typeof summary.findings>();
  for (const sev of SEVERITY_ORDER) {
    grouped.set(sev, []);
  }
  for (const f of summary.findings) {
    grouped.get(f.severity)!.push(f);
  }

  for (const sev of SEVERITY_ORDER) {
    const items = grouped.get(sev)!;
    if (items.length === 0) continue;

    const sevLabel = sev.charAt(0).toUpperCase() + sev.slice(1);
    lines.push(`### ${sevLabel} (${items.length})`);

    const showAll = sev === "critical" || sev === "error";
    const limit = showAll ? items.length : 5;
    const visible = items.slice(0, limit);

    for (const item of visible) {
      lines.push(`- **${item.ruleId}**: ${item.message}`);
    }

    if (!showAll && items.length > limit) {
      lines.push(`- *...${items.length - limit} more*`);
    }

    lines.push("");
  }

  lines.push("---");
  lines.push('<sub>Generated by <a href="https://pseolint.dev">pSEO Lint</a></sub>');

  return lines.join("\n");
}

async function run(): Promise<void> {
  const source = core.getInput("source", { required: true });
  const threshold = Number(core.getInput("threshold") || "40");
  const token = core.getInput("token") || process.env.GITHUB_TOKEN || "";

  core.info(`Running pseolint on ${source} with threshold ${threshold}`);

  const summary = await auditSource(source);

  core.info(`Score: ${summary.score}/100 (${summary.pageCount} pages)`);
  core.setOutput("score", summary.score);
  core.setOutput("pageCount", summary.pageCount);

  const context = github.context;
  if (token && context.payload.pull_request) {
    const octokit = github.getOctokit(token);
    const prNumber = context.payload.pull_request.number;
    const body = formatPrComment(summary);

    const { data: comments } = await octokit.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
    });

    const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));

    if (existing) {
      await octokit.rest.issues.updateComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        comment_id: existing.id,
        body,
      });
      core.info(`Updated existing PR comment #${existing.id}`);
    } else {
      await octokit.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber,
        body,
      });
      core.info("Created new PR comment");
    }
  }

  if (summary.score >= threshold) {
    core.setFailed(
      `SpamBrain Risk Score ${summary.score} exceeds threshold ${threshold}`
    );
  }
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
```

- [ ] **Step 4: Verify typecheck**

Run: `cd packages/action && bun run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/action/
git commit -m "feat(action): implement GitHub Action with PR comment posting

Runs auditSource on build output, posts markdown summary as a PR
comment (upserted via hidden marker), and fails the check if score
exceeds threshold.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Add action release workflow

**Files:**
- Create: `.github/workflows/action-release.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/action-release.yml`:

```yaml
name: Release Action

on:
  push:
    tags:
      - "v*"

jobs:
  build-action:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.2.13"
      - name: Install dependencies
        run: bun install
      - name: Build core
        run: cd packages/core && bun run build
      - name: Build action
        run: cd packages/action && bun run build
      - name: Deploy to action-v1 branch
        run: |
          cd packages/action
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git checkout --orphan action-v1-tmp
          git reset
          git add action.yml dist/
          git commit -m "Release action ${{ github.ref_name }}"
          git push origin action-v1-tmp:action-v1 --force
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/action-release.yml
git commit -m "ci: add action release workflow for action-v1 branch

Triggered on version tags, builds packages/action with ncc and
force-pushes to the action-v1 branch for GitHub Actions consumption.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `bun run test`
Expected: all tests pass (100+).

- [ ] **Step 2: Run full build**

Run: `bun run build`
Expected: all packages build successfully.

- [ ] **Step 3: Verify git log**

Run: `git log --oneline -10`
Expected: 7 clean commits (1 initial scaffold + 6 from this plan).
