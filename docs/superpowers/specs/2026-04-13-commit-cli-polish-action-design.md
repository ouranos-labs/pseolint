# Commit, CLI Polish, and GitHub Action: Design Spec

**Date:** 2026-04-13
**Scope:** Three workstreams to ship CLI v1.0-ready: commit + CI, CLI flag additions, GitHub Action implementation.

---

## 1. Commit + CI

Commit all current uncommitted work (30 rules, formatters, CLI, bug fixes) and verify CI passes.

**Commit:** Single commit covering everything added/fixed this session. The initial scaffold commit already exists; this is the second commit with all rule implementations, formatters, CLI rewrite, and bug fixes.

**CI verification:** The existing `.github/workflows/ci.yml` already uses `oven-sh/setup-bun`, `bun install`, `bun run lint`, `bun run build`, `bun run test` and triggers on push to main + PRs. No changes needed, just verify it passes after commit.

---

## 2. CLI Polish

### New AuditOptions fields

Add to `AuditOptions` in `packages/core/src/types.ts`:

```typescript
export interface AuditOptions {
  rules?: { /* existing */ };
  concurrency?: number;   // max parallel HTTP fetches (default: 5)
  timeout?: number;       // per-request timeout in ms (default: 30000)
  sampleSize?: number;    // audit random subset of N pages (0 = all, default: 0)
  ignore?: string[];      // URL/path glob patterns to exclude
}
```

### Auditor changes (`packages/core/src/auditor.ts`)

**concurrency:** Replace `DEFAULT_CONCURRENCY` constant with `options.concurrency ?? 5`. Pass to `runWithConcurrency`.

**timeout:** Apply `AbortSignal.timeout(ms)` to all fetch calls in `fetchWithRetry` and `fetchTextStrict`. Default 30000ms.

**sampleSize:** After `loadPagesFromSource` and deduplication, if `sampleSize > 0 && sampleSize < deduped.length`, shuffle `deduped` with Fisher-Yates and take the first N entries.

**ignore:** After loading pages, filter out any whose URL matches an ignore pattern. Use simple glob matching: `*` matches any non-separator chars, `**` matches anything including separators. Match against the URL pathname (for HTTP) or relative file path (for filesystem). No external dependency, inline matcher function.

### CLI changes (`packages/cli/src/cli.ts`)

New Commander options:
```
--concurrency <n>    Max parallel HTTP fetches (default: 5)
--timeout <ms>       Per-request timeout in ms (default: 30000)
--sample-size <n>    Audit a random subset of N pages (default: all)
--ignore <patterns>  Comma-separated glob patterns to exclude
```

The `--ignore` flag accepts a comma-separated string that gets split into an array.

These flags merge into `AuditOptions` alongside config file values. CLI flags take precedence over config file.

### Config changes (`packages/cli/src/config.ts`)

Add the four new fields to the zod schema:
```typescript
concurrency: z.number().optional(),
timeout: z.number().optional(),
sampleSize: z.number().optional(),
ignore: z.array(z.string()).optional(),
```

Rewrite `mergeOptions` to actually merge CLI flags over config. Only override a config value if the CLI flag was explicitly provided (not the default). Commander stores defaults as strings, so check if the value differs from the default before overriding:

```typescript
export function mergeOptions(configFile: AuditOptions, cliFlags: CliFlags): AuditOptions {
  const result = { ...configFile };
  if (cliFlags.concurrency !== undefined) result.concurrency = cliFlags.concurrency;
  if (cliFlags.timeout !== undefined) result.timeout = cliFlags.timeout;
  if (cliFlags.sampleSize !== undefined) result.sampleSize = cliFlags.sampleSize;
  if (cliFlags.ignore !== undefined) result.ignore = cliFlags.ignore;
  return result;
}
```

---

## 3. GitHub Action

### Overview

The action runs a full pseolint audit on a build directory within a GitHub Actions workflow, posts a markdown summary as a PR comment, and fails the check if the score exceeds a threshold.

### action.yml inputs

```yaml
inputs:
  source:
    description: "Build output directory to audit"
    required: true
  threshold:
    description: "Score threshold for check failure"
    required: false
    default: "40"
  token:
    description: "GitHub token for PR comments"
    required: false
    default: ${{ github.token }}
```

### Implementation (`packages/action/src/index.ts`)

**Dependencies:** `@actions/core`, `@actions/github`, `@pseolint/core` (workspace import, change existing `pseolint` dep to `@pseolint/core`).

**Flow:**
1. Read inputs via `@actions/core.getInput()`
2. Call `auditSource(source)` from `@pseolint/core`
3. Build a custom markdown comment body (NOT `formatMarkdown`: the action needs truncation and the HTML marker that `formatMarkdown` doesn't include). Write a local `formatPrComment(summary: AuditSummary): string` function in the action source.
4. Find or create a PR comment (identified by a hidden HTML marker `<!-- pseolint-report -->`)
5. Post/update the comment via `@actions/github`
6. If `summary.score >= threshold`, call `core.setFailed()`

**Comment upsert logic:**
```
1. List comments on the PR
2. Find one containing "<!-- pseolint-report -->"
3. If found → update it
4. If not found → create new comment
```

The markdown body prepends `<!-- pseolint-report -->` as the first line so future runs can find and update it.

### PR comment format

```markdown
<!-- pseolint-report -->
## pSEO Lint: Score: {score}/100 ({label})

| Category | Score |
|----------|------:|
| Spam     |  {n}  |
| Content  |  {n}  |
| Links    |  {n}  |
| Tech     |  {n}  |
| Schema   |  {n}  |
| Cannibal |  {n}  |

### {Severity} ({count})
- **{ruleId}**: {message}
...

(truncated to top 5 per severity for warnings/info)

---
<sub>Generated by <a href="https://pseolint.dev">pSEO Lint</a></sub>
```

### Distribution

**Release branch approach (Option A from brief):**

A workflow `.github/workflows/action-release.yml` triggers on version tags (`v*`):
1. Builds `packages/action/` with `@vercel/ncc` to bundle everything into a single `dist/index.js`
2. Force-pushes the compiled output to branch `action-v1`
3. Users reference: `uses: ouranos-labs/pseolint@action-v1`

### Package changes

`packages/action/package.json` needs:
- `@actions/core` and `@actions/github` as dependencies
- `@vercel/ncc` as devDependency
- `@pseolint/core` as workspace dependency
- Build script: `ncc build src/index.ts -o dist`

---

## Deferred

- `--data-source <file>` CLI flag (template JSON comparison): separate design session
- PR comment score diff from main branch: requires hosted platform for baseline storage
- `PSEOLINT_TOKEN` integration in action: requires hosted platform API
