# AI Fix-to-PR + AEO Citation Loop — Design Spec

**Date:** 2026-07-17
**Scope:** Close the AI loop. Today `orchestrate` produces a validated `FixManifest` and stops at "here's what to fix." This spec turns that manifest into an actual pull request against the user's repo, and adds an AEO citation-optimization loop that emits patches onto the same delivery rail.

**Status:** Design. No code yet.

---

## 0. Why

The product already does the hard 80%: an agentic auditor (`packages/core/src/ai/orchestrator/`) with 22 tools that diagnoses a live pSEO site by template and emits a **validated** `FixManifest` (`ai/manifest/finish-tool.ts`, walked by `ai/manifest/validate-manifest.ts`). The tagline is "fix one template, fix N pages" — but a human still hand-applies every fix. The leverage is the last mile: **apply the manifest**.

Two patch classes fall out of the existing schema, and they want different delivery:

- **Deterministic patches** — JSON-LD blocks, `canonical`, `meta robots`, required fields, schema-consistency. Machine-checkable, find/replace-shaped. → **auto-edit files, open a PR.**
- **Generative patches** — thin-content rewrite, near-duplicate differentiation, answer-first block, FAQ coverage. Judgment calls. → **propose as PR review suggestions for human approval, never silently committed.**

This split is the spine of the whole feature.

---

## 1. The hard problem: template → source mapping

pseolint audits a **live site by URL**. The manifest's patches are keyed by *template signature* / route (e.g. `/listing/:slug`), not by source file. To open a repo PR we must map a template back to the source that renders it (a Next.js `page.tsx`, an Astro component, a Hugo layout, …).

Three options, laziest first:

1. **User-authored mapping (MVP).** A committed `.pseolint/templates.json`:
   ```json
   {
     "/listing/:slug": "app/listing/[slug]/page.tsx",
     "/category/:slug": "app/category/[slug]/page.tsx"
   }
   ```
   Zero inference, zero magic, works for every framework. Ship this first.
2. **AI-inferred mapping.** A new orchestrator tool `locate_template_source(signature)` that greps the connected repo for the route and proposes the file. Gated behind human confirmation in the PR. Add *after* (1) proves the delivery rail.
3. **Framework adapters.** Per-framework resolvers (Next app-router, Astro, Hugo). Only if (2) is too noisy. Probably YAGNI.

**Decision:** build (1). Defer (2) and (3). The mapping is an input to the renderer, not part of it.

---

## 2. Architecture — the delivery rail

```
orchestrate (existing) ──► FixManifest (existing, validated)
                                  │
                                  ▼
                      ┌── manifest-renderer (NEW) ──┐
                      │  split by patch class        │
                      │  + apply template mapping    │
                      └──────────────┬───────────────┘
              deterministic          │          generative
                      ▼              │              ▼
             real file edits         │      PR review suggestions
                      └──────► GitHub PR ◄──────────┘
                                  │
                                  ▼
                  CI re-audit (existing GitHub Action)
                  → PR comment shows risk delta before/after
```

Nothing upstream of the renderer changes. The renderer is one new module; the PR mechanics reuse the GitHub MCP/App the web app already holds tokens for.

### 2.1 `manifest-renderer` (new — `packages/core/src/ai/apply/`)

Pure function, no I/O:

```ts
renderManifest(manifest: FixManifest, mapping: TemplateMapping): {
  edits: FileEdit[];        // deterministic: { path, find, replace, ruleId }
  suggestions: Suggestion[];// generative: { path?, ruleId, rationale, proposed }
  unmapped: TemplatePatch[];// no source file — surface as a checklist item
}
```

- `edits` are exact and idempotent (re-running yields the same file). Each carries its originating `ruleId` for the PR body.
- `suggestions` never touch files directly; they become GitHub review comments (`add_comment_to_pending_review`).
- `unmapped` is honest debt — listed in the PR body so nothing is silently dropped.

### 2.2 PR opener (web app — `apps/web`)

Reuses the existing GitHub integration + tokens. One PR per audit run:

- Branch: `pseolint/fix-<auditSlug>`.
- Commits `edits` grouped by template (so "fix one template" is one reviewable unit).
- PR body: rendered from the manifest — per-category grades, per-template fix list, `unmapped` checklist.
- `suggestions` posted as a pending review, then submitted.
- Idempotent: re-running an audit updates the same branch, force-with-lease.

### 2.3 Close the loop with CI

The GitHub Action (`packages/action/`) already runs pseolint on push/PR. On the fix branch it re-audits and comments the **risk delta vs. the base run**. That comment is the payoff: "this PR takes `/listing/:slug` from D → B, risk 74 → 41."

---

## 3. ② AEO citation loop rides the same rail

The second direction is *not* a separate system — it's a different **patch generator** whose output is the same `FixManifest` patch type, so it inherits §2 for free.

Assets that already exist: `ai/tools/ask-ai-engine.ts` (does Claude/Perplexity/Gemini actually *cite* this page?) and `check-rule-citable-facts.ts` / `check-rule-answer-first.ts`. Today they're pass/fail. Turn them into a loop:

```
for a low-citability page/template:
  draft answer-first block + FAQ/JSON-LD  (generative patch)
  re-run ask_ai_engine on the drafted content
  keep the draft that flips "not cited" → "cited" (or best score)
  emit as a generative patch on the manifest
```

Budget-capped exactly like the orchestrator (`orchestrator/budget.ts`), because `ask_ai_engine` is billable. Output is a generative patch → §2.2 delivers it as a review suggestion. No new delivery code.

**This is the strongest net-new differentiator:** nobody else can do "rewrite until an AI engine cites you," because nobody else has the citation probe wired to a patch pipeline.

---

## 4. Build order

1. **Renderer + mapping (1) + deterministic edits only.** Manifest → PR with JSON-LD/canonical/meta fixes. Generative patches listed in the PR body as a checklist (no auto-suggestions yet). This alone ships "AI opens a PR that fixes your schema."
2. **Generative suggestions.** Wire the generative class to GitHub review suggestions.
3. **CI re-audit delta comment.** Close the loop visibly.
4. **② AEO citation loop** as a patch generator feeding step 2's rail.
5. **AI-inferred mapping (2)** once the rail is proven.

Steps 1–3 are the moat. Ship them before 4–5.

---

## 5. Non-goals / deferred

- Auto-merge. Humans merge; we open and re-audit. (`ponytail:` never auto-merge SEO changes to a live site.)
- Framework adapters (§1.3) — YAGNI until inferred mapping proves noisy.
- Non-GitHub forges (GitLab, Bitbucket) — GitHub first; the renderer is forge-agnostic so this is a later adapter.
- Model refresh: the default model IDs (`claude-sonnet-4-6`, `claude-opus-4-7`, `gemini-2.5-*`) and the hardcoded `cost.ts` pricing table are stale. Separate housekeeping pass; verify against the current API reference before touching.

---

## 6. Open questions

1. Mapping ownership: `.pseolint/templates.json` in the audited repo, or stored server-side per connected domain? (Repo is more transparent and diffable — lean repo.)
2. One PR per run vs. one PR per template? (Per run, grouped commits per template — fewer PRs to triage.)
3. Do deterministic edits need a per-rule opt-out, or is the whole PR the review unit? (Whole PR; reviewers drop commits they don't want.)
