# Contributing

Thanks for helping build `pseolint`.

## Development

1. Install dependencies: `bun install`
2. Build all workspaces: `bun run build`
3. Run checks: `bun run lint && bun run typecheck && bun run test`

## Workspace Rules

- Keep package boundaries clean (`core` -> `cli` -> `action`).
- Add tests for behavior changes.
- Use Changesets for versioned changes.
- Every workspace must have both a `lint` and a `typecheck` script. `turbo run
  typecheck` silently skips a package that has neither, so a missing script is
  not a gap you will be told about; it is a package nothing analyses.

## What CI runs

`.github/workflows/ci.yml` has two jobs.

**`checks`** installs dependencies, installs the pinned Chromium, then runs
lint, typecheck, the em dash gate, build and test.

- The Chromium install exists because `packages/core/tests/renderer.test.ts` and
  `renderer-resources.test.ts` are `it.skipIf(!hasBrowser())`. Without a browser
  they skip, and a skipped test is reported exactly like a passing one. A step
  after the install asserts the binary is on disk so a failed install is a red
  build rather than two tests quietly vanishing.
- The checkout uses `fetch-depth: 0`. `scripts/no-em-dash.mjs --diff` needs a
  merge-base with `main`; on a depth-1 checkout there is no `main` ref, and the
  script falls back to checking every line of every file it is handed, which
  fails on prose that predates the gate.

**`calibration`** runs `bun run calibrate:corpus` and then
`bun run test:calibration`.

## Gates you can run locally

| Command | What it gates |
| --- | --- |
| `bun run lint` | `tsc --noEmit` per workspace |
| `bun run typecheck` | the same, invoked explicitly, including `apps/extension` (allowJs + checkJs) |
| `bun run test` | vitest per workspace, plus the extension's plain-node tests |
| `bun run lint:emdash` | every em dash on a line this branch added, whole repo, advisory in CI |
| `bun run lint:emdash:copy` | the hard gate: same check, restricted to source and docs |
| `bun run calibrate:corpus` | the corpus against committed fixtures, hermetic, about 4 minutes |
| `bun run test:calibration` | the verdict ceilings, the coverage floor and the scorecard ratchet |

### The em dash gate

`bun run lint:emdash:copy` is the blocking one. Its file set is
`bun run emdash:copy-paths`: source and docs, minus tests and fixtures. Inside
that set an em dash is copy rather than data, so `[literal]` and `[escaped]`
findings fail the build alongside prose ones. That is on purpose. The case the
gate exists for is user-facing text sitting inside a string prop, and both of
those labels are how the tool reports one.

Tests and fixtures are excluded because there the dash genuinely is the subject
matter: assertions about separator handling, scraped HTML whose bytes must not
move. `bun run lint:emdash` still reports them, and CI publishes that report to
the job summary without failing on it.

One file, `packages/core/src/rules/content/title-uniqueness.ts`, is excluded by
name. `no-em-dash.mjs` matches the escaped spellings against the raw line rather
than the masked one, so it flags the escape inside that file's
`TITLE_SEPARATOR` regex character class, which is data. Delete the exclusion
once the escaped check masks literals the way the bare-dash check already does.

### The calibration ratchet

`packages/core/tests/calibration/reputable-corpus.test.ts` reads
`scripts/calibration-results.json`, which is gitignored. Locally it soft-skips
when that file is missing or older than 14 days; read a local skip as "this said
nothing", not as a pass. Under `CI=true` it fails instead, because CI produces
the file immediately beforehand and the only reason it could be absent there is
a broken gate.

`bun run calibrate:corpus` is `scripts/calibration-corpus.ts --fixtures-only`:
it audits the committed fixtures in `packages/core/calibration/fixtures`, makes
no network requests, and is deterministic. The runner itself exits non-zero on a
verdict regression against `packages/core/calibration/baseline-scorecard.json`;
the vitest suite adds the per-site verdict ceilings, a floor on how many
reputable sites were actually gated, and a ratchet on AUC, precision and recall.

To land a deliberate change to any of those numbers, regenerate the baseline in
the same commit:

```
bun run scripts/calibration-corpus.ts --fixtures-only --write-baseline
```

The point is that the new number gets reviewed rather than absorbed.

## License Model

- `packages/*` are MIT-licensed.
- `apps/web` is AGPL-3.0-licensed.
