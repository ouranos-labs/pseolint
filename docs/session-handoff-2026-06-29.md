# Session handoff: 2026-06-29 (branch `claude/programmatic-seo-skills-eval-862v0e`)

Pick up from your local machine. Grouped by: merge decision → pre-merge checks →
needs-your-machine → follow-up work → what shipped (context).

---

## 0. Merge decision: READ FIRST

**Do not blind-merge this branch to `main` from the web session.** It carries the
*entire* v0.7.x body (render mode, R2 cache, Browserless CDP, scan-options,
content-effort, the 0.7.3/0.7.4 releases) **plus** this session's 13 commits.
Merging = a release-level event, not a small skills PR.

Recommended path:
- [ ] Open a PR and review the full diff (`git diff main...HEAD`): confirm you
      intend to ship the whole branch, not just the skills work.
- [ ] If you only want the low-risk parts now, cherry-pick the skills + docs +
      tests commits and leave the engine/web changes for a deliberate release.
- [ ] The one commit that deserves real scrutiny: **`feat(core): promote
      content-effort to a recall driver`**; it changes verdict behavior (only
      when `--content-effort` is on). Unit-tested + changeset added, but verify
      against the full suite locally.

## 1. Pre-merge checks (run locally: couldn't run cleanly in the sandbox)

- [ ] `bun install && bun run build` (packages weren't built in the sandbox, so
      web-app tests + tsc couldn't resolve `@pseolint/core`).
- [ ] Full test suite: `bun run test` (sandbox could only run isolated core
      tests; the 28 `apps/web` integration failures there were DB/env, not code:
      reconfirm locally).
- [ ] Re-run calibration to refresh the gate: `bun run scripts/calibration-corpus.ts`
: expect addressable recall ≈80% (was 67%) from the content-effort driver,
      0 reputable-ceiling breaches.

## 2. Needs your machine / GitHub settings (I can't do these from here)

- [ ] **Re-point the `action-v1` tag** to a commit containing the node24 bump,
      or the live Action keeps running node20. (`packages/action/action.yml`.)
- [ ] **GitHub repo Topics** (the #1 discovery lever): `programmatic-seo`, `aeo`,
      `geo`, `ai-overviews`, `seo`, `llms-txt`, `spambrain`, `claude-skills`,
      `claude-code`.
- [ ] **Repo description + homepage URL**: mention skills + AEO (empty/stale
      description reads as neglect).
- [ ] Prod note: the content-effort recall lift only fires when
      `ANTHROPIC_API_KEY` is set (Pro web audits / opt-in CLI). Free/default
      audits stay at baseline recall: by design.

## 3. Follow-up work (engine-backed, scoped: do when it earns its keep)

- [ ] **Promote seed corpus entries**: `packages/core/calibration/seed-todo.json`
      has 22 net-new candidates. Capture penalty-time Wayback fixtures, set
      pinnedUrls + localFixtureDir, move into `calibration-corpus.json`, refresh
      `baseline-scorecard.json`. Workflow: `docs/superpowers/calibration/TODO-penalized-corpus.md`.
- [ ] **AEO firing-rate debt**: `aeo/freshness-signals` + `aeo/citable-facts`
      fire on 100% of reputable sites (calibration test flags it). The /rules
      freshness fix this session addressed our own pages; the rule-side over-fire
      is still open.
- [ ] **Grow the skills suite** (next siblings, all already rule-backed):
      `schema-markup`, `technical-seo`, `internal-linking`, `spambrain-risk`.
      Cross-refs + `skills/README.md` table + `.claude-plugin/marketplace.json`
      extend automatically.
- [ ] **Live dogfood confirm**: run `pseolint` against `/r/[slug]` + `/m/[slug]`
      to see the per-template verdicts behind the risk-28 badge, and confirm the
      freshness fix moved it.
- [ ] **June 2026 spam-update casualties**: re-poll in 2–4 weeks for named
      victim domains (none published yet at 3 days); add to the seed.
- [ ] Optional `score.ts`: exclude `detectability: off-page-only` from the
      addressable-recall denominator (parasite SEO is undetectable on-page).

## 4. What shipped this session (13 commits, all pushed)

- **Skills suite**: `skills/pseolint` (full-lifecycle pSEO, 12 playbooks bound
  to rules), `skills/aeo` (AEO/GEO, bound to `aeo/*`), cross-referenced, with a
  discovery front door (`skills/README.md`) + plugin marketplace + a Skills
  section in the top-level README. Installable: `npx skills add ouranos-labs/pseolint --skill pseolint aeo`.
- **Engine**: content-effort promoted from a ±1 nudge to a recall driver
  (addressable recall 67%→80%, no new FP); unit-tested; changeset added.
- **Tests**: covered the untested link-graph + near-duplicate rules.
- **Action**: node20→node24; dogfood `fail-on-truncated` off (serverless
  backpressure was self-flunking a healthy audit).
- **Calibration**: root-cause spec (`docs/superpowers/specs/2026-06-29-…`) with
  two documented negative results; 22-entry archetype-diverse corpus seed + TODO.
- **Web**: freshness signals on `/rules/[ruleId]` (dogfood finding).

## TL;DR
Skills + docs + tests are low-risk and merge-ready. The engine + web + release
body needs a deliberate local build/test pass before it hits `main`. Treat the
merge as a release, open a PR, and verify locally first.
