# Manifest → PR Opener — Design Spec

**Date:** 2026-07-17
**Scope:** Turn the standalone fix-to-PR rail (`renderManifest` + `pseolint apply`) into the actual moat: an AI-opened pull request that fixes a site's source templates. Ships via the CLI + GitHub Action using the workflow's own token — no per-user GitHub infrastructure.

**Status:** Design. Follows the review-driven cleanup that pulled the premature orchestrator wiring; this is the deliberate completion of the rail.

---

## 0. The decision that shapes everything

There are two ways to open the PR:

1. **Web-app button** ("AI opened a PR" from `/m/[slug]`). Requires the web app to hold each user's GitHub credentials → a **GitHub App + OAuth + installation webhooks + token vault**, none of which exist (`apps/web` has zero GitHub user-auth today; every `github` reference is a marketing link). Large infra.
2. **CLI / GitHub Action** (`pseolint apply --pr`). Runs inside the user's own CI and opens the PR with the workflow's `GITHUB_TOKEN`. `packages/action` **already** carries `octokit` + `GITHUB_TOKEN` + PR-comment plumbing. Near-zero new infra.

**Decision: build (2).** It turns the rail into the moat for ~a day of work; (1) is deferred until user demand justifies the GitHub-App build. The PR-opening logic lives in the **CLI** (reusable locally and in any CI); the Action is a thin wrapper.

---

## 1. The loop (all in the user's CI, on their repo)

```
pseolint orchestrate <preview-url> --manifest-out m.json        # exists
  └─ renderManifest(m.json, .pseolint/templates.json)           # exists (pure, tested)
       ├─ deterministic edits ─► written to source files        # exists (applyEditToContent)
       └─ generative / unmapped ─► PR body checklist             # exists (renderManifest split)
  └─ git branch + commit + push + open PR                       # BUILD — the only new surface
       └─ CI re-runs pseolint on the branch → risk-delta comment # exists (action posts comments)
```

Nothing upstream of "open PR" changes.

---

## 2. What exists vs. what to build

| Piece | Status |
|---|---|
| `orchestrate` → validated `FixManifest` | ✅ done |
| `renderManifest(manifest, mapping)` → `{ edits, checklist }` | ✅ done, tested |
| `applyEditToContent` + file writing (`runApplyCommand`) | ✅ done, tested |
| Action `octokit` + `GITHUB_TOKEN` + PR comments | ✅ exists (`packages/action/index.ts`) |
| **`--pr` mode: branch / commit / push / create-PR** | 🔨 build |
| Action `mode: fix` input | 🔨 thin wrapper |
| `.pseolint/templates.json` (route → source map) | user-authored (AI-inferred deferred) |

---

## 3. MVP boundary (ruthlessly lean)

- **Deterministic edits only are committed** — meta title/description, H1, `robots.txt`, `sitemap.xml`. **Generative** patches (FAQ blocks, prose rewrites) and **unmapped** ones go into the **PR body as a checklist**, never auto-committed. This is exactly the split `renderManifest` already returns.
- **User authors the mapping.** `.pseolint/templates.json` maps route pattern → source file. No AI inference in v1.
- **Idempotent.** Re-running updates the same `pseolint/fix-<slug>` branch (force-with-lease); it never spams new PRs.
- **Honest about misses.** `applyEditToContent` already demotes literals it can't find in source (interpolated templates like `Best in ${city}`) to the checklist — the PR states what it couldn't auto-apply.

---

## 4. Build order (each slice shippable)

### Slice 1 — make `apply` reusable
Refactor `runApplyCommand` (`packages/cli/src/commands/apply.ts`) to **return** `{ changedFiles: string[], applied: number, checklist: ChecklistItem[] }` instead of writing to stdout + `process.exit`. The current CLI print path becomes a thin renderer of that result. Small, unlocks slice 2. Existing `apply.test.ts` adapts to assert on the return value.

### Slice 2 — `pseolint apply <manifest> --pr` (the core work)
After a successful apply with `changedFiles.length > 0`:
- **git** via `node:child_process`: `git checkout -B pseolint/fix-<slug>`, `git add` the changed files, `git commit -m`, `git push --force-with-lease -u origin <branch>`.
- **create/update PR** via a single `fetch` to `POST /repos/{owner}/{repo}/pulls` (and a lookup for an existing open PR on that head → update body instead). **No `octokit` dependency in the MIT CLI** — raw `fetch` with `Authorization: Bearer ${token}`.
  - `token`: `--token` → `GITHUB_TOKEN` env.
  - `owner`/`repo`: `--repo-slug owner/repo` → derive from `git remote get-url origin`.
  - `base`: `--base` (default the repo's default branch).
  - **body**: rendered from the checklist — grouped, with the `unmapped`/generative items as a task list so the human sees exactly what's left.
- New flags on the `apply` command: `--pr`, `--token`, `--repo-slug`, `--base`, `--branch` (default `pseolint/fix-<slug>`).
- Guardrails: refuse `--pr` when the working tree is dirty beyond the applied edits; no-op (exit 0, print "nothing to fix") when `changedFiles` is empty.

### Slice 3 — Action `mode: fix`
Add a `mode` input to `packages/action` (default `comment` = today's behavior). `mode: fix` runs `orchestrate <domain> --manifest-out` then `apply <manifest> --pr`, reusing the action's existing token. One workflow step opens the fix PR.

### Slice 4 — docs
A copy-paste workflow snippet + the `.pseolint/templates.json` format (route pattern → source path, `robots.txt`/`sitemap.xml` special keys), in the README's ecosystem section.

---

## 5. The mapping format (v1, user-authored)

```json
{
  "/listing/:slug": "app/listing/[slug]/page.tsx",
  "/category/:slug": "app/category/[slug]/page.tsx",
  "robots.txt": "public/robots.txt",
  "sitemap.xml": "app/sitemap.ts"
}
```

Route keys match audited URLs (`:seg` / `[seg]` / `*` wildcards, per `render-manifest.ts`). File keys (`robots.txt`, `sitemap.xml`) map the domain-level patches. Missing entries → the patch lands in the checklist, not silently dropped.

---

## 6. Hard parts / honest risks

- **Mapping friction is the tax.** Users must author `.pseolint/templates.json`. This is the deferred-AI-inference cost; flag it loudly in docs. It's the single biggest adoption friction and the first thing to revisit (AI-inferred mapping = the natural v2).
- **`git push` auth** relies on `actions/checkout` having configured the token as the git credential (standard GitHub Actions setup). Locally, the user's own git creds. Document the `permissions: contents: write, pull-requests: write` the workflow needs.
- **Force-push safety.** `--force-with-lease` on a tool-owned branch (`pseolint/fix-*`) only — never a user branch.
- **Determinism holds.** The audit → manifest → render → apply chain is unchanged and still LLM-free at the scoring layer; only the *content* of generative patches is AI-authored, and those don't auto-commit.

---

## 7. Non-goals (explicit)

- The **web-app "Open PR" button** — deferred until GitHub-App infra is justified by users.
- **AI-inferred template→source mapping** — v2.
- **Auto-applying generative patches** — humans approve wording; they stay in the PR body.
- **Non-GitHub forges** (GitLab, Bitbucket) — the `--pr` core is forge-agnostic (one API call), so this is a later adapter, not a rewrite.
- **Auto-merge** — the tool opens and re-audits; a human merges.

---

## 8. Effort

Slices 1–3 are ~a day: the hard 80% (audit → manifest → render → apply) exists and is tested. The new surface is "git + one API call." That asymmetry — huge existing rail, tiny remaining wedge — is the whole reason the CLI/Action framing wins over the web button.
