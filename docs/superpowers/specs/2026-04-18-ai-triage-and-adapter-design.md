# AI Triage Layer + Adapter Scaffold Design

**Status:** Draft, 2026-04-18
**Author:** philippe.kam27@gmail.com + Claude (Opus 4.7)
**Motivation:** Audits routinely produce hundreds of findings. The recently-shipped `enrichFindings` step clusters and groups within a rule, but cannot reason across rules to identify the 2–3 *root causes* driving the noise. Users with 800 findings need "fix the template, 70% disappear"; not a sorted dump. This design introduces a thin, opt-in AI layer that triages enriched findings into ranked root causes, with a vendor-agnostic adapter scaffold so future AI features (semantic dedup, fix synthesis) plug into the same primitives.

## Goal

Turn the post-`enrichFindings` output into a **prioritized fix list** of 1–5 root causes, with cross-rule synthesis and a 1–2 sentence rationale per cause, without removing or rewriting the existing findings list. Establish an `LlmAdapter` interface and two reference implementations (Anthropic, Ollama) so subsequent AI features compose on the same primitives.

## Non-Goals

- **OpenAI adapter.** Trivially additive once the interface ships; deferred to v1.1 to keep test surface minimal.
- **Per-finding fix suggestions.** Different cost profile (one call per finding vs one call per audit) and different UX. Separate feature.
- **Semantic near-duplicate detection.** Different cost class (embeddings, not chat). Validates the embedding-adapter axis. Separate feature.
- **Streaming responses.** Triage is one terminal call producing structured JSON; streaming buys nothing.
- **Dollar-based budget caps.** Pricing tables go stale. We expose an estimated dollar cost as derived info, but the cap is on tokens (provider-stable, vendor-independent).
- **Per-rule AI feature flags.** Only one AI feature in v1; the wider rule-level enable surface is YAGNI until we have ≥3 AI features.
- **Auto-on triggers.** AI is never invoked without an explicit `--ai` flag or `ai.enabled: true` in config. Discovery hint only.
- **Live LLM calls in CI.** All tests use a deterministic stub adapter.

## Architecture

A new `packages/core/src/ai/` module containing the adapter interface, two reference adapters, the triage function, prompt template, and a result cache that mirrors the HTTP-cache patterns shipped last week. The triage step slots into the existing audit pipeline as a post-enrichment, pre-format stage that produces an optional `triage` field on `AuditSummary`.

```
parse → run rules → enrichFindings → [if ai.enabled] triageFindings → format
```

When `ai.enabled` is false (default), the pipeline is unchanged. When true, `triageFindings` runs once per audit, calls the configured `LlmAdapter`, parses a structured JSON response, attaches `summary.triage`, and returns. Formatters detect `summary.triage` and render a new section above the findings list.

### Module layout

| File | Responsibility |
|---|---|
| `packages/core/src/ai/types.ts` | `LlmAdapter`, `LlmRequest`, `LlmResponse`, `TokenUsage`, `TriageResult`, `RootCause` |
| `packages/core/src/ai/triage.ts` | `triageFindings(findings, summary, adapter, options)`; pre-flight estimate; cache lookup; LLM call; JSON parse with shape validation; failure-mode handling |
| `packages/core/src/ai/prompt.ts` | Prompt template builder + `PROMPT_VERSION` constant (semver-shaped string) |
| `packages/core/src/ai/cache.ts` | Disk-backed cache for `TriageResult`; reuses HTTP-cache primitives (atomic write, sha256 keys, TTL) |
| `packages/core/src/ai/cost.ts` | Best-effort per-1M-token pricing lookup; pure function, no network |
| `packages/core/src/ai/adapters/anthropic.ts` | Lazy-imports `@anthropic-ai/sdk` (optional peer dep); maps SDK errors to `AdapterError` |
| `packages/core/src/ai/adapters/ollama.ts` | `fetch('http://localhost:11434/api/chat')`; no SDK dependency |
| `packages/core/src/ai/adapters/index.ts` | `createAdapter(config)` factory: id → instance |

### Adapter interface

**Scope:** chat-only, single-turn. The `LlmAdapter` interface intentionally does NOT grow to cover embeddings, multi-turn, or tool-use. Future AI features that need different shapes (e.g., semantic near-duplicate via embeddings) get their own typed interface (`EmbeddingAdapter`) in the same `ai/adapters/` directory. Keeping this contract small means each adapter file stays under ~150 LOC and provider quirks don't leak across feature lines.

```ts
export interface LlmRequest {
  system: string;
  user: string;
  // No multi-turn / no tools in v1. Keep the surface minimal so adapters stay thin.
}

export interface LlmResponse {
  text: string;
  usage: TokenUsage;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface LlmAdapter {
  readonly id: 'anthropic' | 'ollama';
  readonly model: string;
  /**
   * Single-turn completion. MUST throw `AdapterError` (not provider-specific
   * errors) so the triage layer can branch uniformly on failure mode.
   */
  chat(req: LlmRequest, opts?: { maxOutputTokens?: number; signal?: AbortSignal }): Promise<LlmResponse>;
  /**
   * Pre-flight input-token estimate. May be a heuristic (chars/4) for adapters
   * without a tokenizer: exact precision is not required, only consistency.
   */
  estimateInputTokens(req: LlmRequest): number;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly kind: 'auth' | 'network' | 'rate-limit' | 'server' | 'sdk-missing' | 'invalid-response',
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}
```

`AdapterError.kind` is the contract triage uses for fail-open branching. Adapters MUST normalize provider-specific errors into one of these six kinds.

### Provider auto-detection

When `--ai-provider` is omitted (and `ai.provider` not set in config), `createAdapter` resolves provider in this order:

1. If `ANTHROPIC_API_KEY` is set → Anthropic.
2. Else, attempt a `HEAD http://localhost:11434/` with a 500 ms timeout → if 2xx/4xx, Ollama is reachable → Ollama.
3. Else → throw `AdapterError('No AI provider configured. Set ANTHROPIC_API_KEY or run Ollama locally, or pass --ai-provider explicitly.', 'auth')`. The audit completes via the fail-open path; user sees one stderr line.

This keeps the happy path zero-config for both common cases (cloud user with key, local user with Ollama running) without ever calling out to either silently.

### Anthropic adapter

- Optional peer dependency: `@anthropic-ai/sdk` (declared in `peerDependencies` and `peerDependenciesMeta` as optional).
- Lazy import inside `chat()`: never loaded if user never opts in.
- If import fails (`MODULE_NOT_FOUND`), throws `AdapterError('@anthropic-ai/sdk not installed; run `npm install @anthropic-ai/sdk`', 'sdk-missing')`.
- API key resolution order: `opts.apiKey` → `process.env.ANTHROPIC_API_KEY` → throw `AdapterError('No Anthropic API key', 'auth')`.
- Default model: `claude-sonnet-4-6` (overridable via `--ai-model`).
- Token estimate: `Math.ceil((system.length + user.length) / 4)` heuristic. Documented as "approximate; exact billing reflected in `usage` after the call."
- Maps SDK errors:
  - `401/403` → `auth`
  - `429` → `rate-limit`
  - `5xx` → `server`
  - Network/DNS → `network`
  - Empty/malformed body → `invalid-response`

### Ollama adapter

- Zero dependencies: uses Node `fetch`.
- Default endpoint: `http://localhost:11434` (overridable via `--ai-endpoint`).
- Default model: `llama3.1:8b` (overridable via `--ai-model`).
- POST `/api/chat` with `{ model, messages: [{role:'system',content},{role:'user',content}], stream: false, format: 'json' }`. The `format: 'json'` flag forces structured output.
- Token estimate: same `chars/4` heuristic. `usage.input` and `usage.output` populated from the `prompt_eval_count` / `eval_count` fields Ollama returns in the response body.
- Maps fetch errors:
  - `ECONNREFUSED` → `AdapterError('Ollama not reachable at <endpoint>', 'network')`
  - HTTP 404 (model not pulled) → `AdapterError('Model "<id>" not pulled. Run: ollama pull <id>', 'invalid-response')`
  - Non-2xx → `server`

### Triage prompt

The prompt is a constant template in `prompt.ts` with one interpolated section: a compact JSON projection of the enriched findings. The template instructs the model to produce JSON matching the `TriageResult` schema, with explicit field constraints and an example.

```ts
export const PROMPT_VERSION = '1.0.0';

const SYSTEM = `You are an SEO audit triage assistant. Given a list of pSEO linter findings,
identify 1–5 underlying ROOT CAUSES driving the findings. Group findings by shared
underlying problem, not by rule ID. Rank causes by likely SEO impact.

Output STRICT JSON matching this schema:
{
  "rootCauses": [{
    "label": "string, ≤80 chars, problem statement",
    "findingsCount": number,
    "affectedRuleIds": ["rule-id", ...],
    "severity": "info" | "warning" | "error" | "critical",
    "fixOrder": number (1 = fix first),
    "rationale": "string, 1–2 sentences explaining impact and fix",
    "relatedFindingIds": ["finding-id", ...]
  }],
  "narrative": "string, 2–3 sentence overall summary"
}

DO NOT include markdown, code fences, or commentary. Output only the JSON object.`;
```

The user message is the JSON projection: `{ totalFindings, pageCount, findings: [{ id, ruleId, severity, message, pageUrl, group? }] }`. The projection caps `findings` at 200 entries (sorted by severity desc, then truncated), beyond that the model degrades and the cost balloons. For audits with >200 findings, we include a `truncated: true` flag and a `findingCountByRule: Record<string, number>` summary so the model still sees the full distribution.

A stable `id` is assigned to each finding before triage: `<ruleId>:<sha256((pageUrl ?? '') + '|' + message).slice(0,8)>`. The `(pageUrl ?? '')` fallback handles findings with no associated URL (e.g., site-wide rules). Same input → same id (deterministic). Collisions are vanishingly unlikely; if they occur, the second finding wins (irrelevant for triage's grouping use case).

### Data sent to the provider

The triage prompt sends, for each finding (capped at 200): `ruleId`, `severity`, `message`, `pageUrl`, and `group` (if set). Finding messages may contain page titles, meta descriptions, or short content excerpts (per existing rule outputs). URLs may identify private pages if the audit is run against a non-public host. Users who audit private content under regulatory constraints (HIPAA, GDPR) should use the Ollama adapter (local, no data leaves the machine) or leave AI disabled. This caveat is documented in the README's AI section.

### TriageResult shape

```ts
export interface RootCause {
  label: string;                  // ≤80 chars
  findingsCount: number;
  affectedRuleIds: string[];
  severity: Severity;             // reuses existing type
  fixOrder: number;               // 1-indexed
  rationale: string;
  relatedFindingIds: string[];    // stable refs into findings
}

export interface TriageResult {
  rootCauses: RootCause[];
  narrative: string;
  modelUsed: string;              // e.g. "claude-sonnet-4-6"
  providerId: 'anthropic' | 'ollama';
  tokenUsage: TokenUsage;
  estimatedCostUsd?: number;      // best-effort; undefined when unknown
  cacheHit: boolean;
  promptVersion: string;          // matches PROMPT_VERSION at audit time
  truncatedInput: boolean;        // true when findings were capped at 200
}
```

### Triage function

```ts
export interface TriageOptions {
  enabled: boolean;
  adapter: LlmAdapter;
  maxInputTokens?: number;        // default: 60000
  maxOutputTokens?: number;       // default: 1500
  cache?: { dir: string; ttlMs: number } | false;  // false = bypass
  signal?: AbortSignal;
}

export async function triageFindings(
  findings: RuleResult[],
  pageCount: number,
  options: TriageOptions,
): Promise<{ result?: TriageResult; skipReason?: string }>;
```

Control flow:

1. Assign stable `id` to each finding (idempotent: same input → same ids).
2. Build `LlmRequest` from prompt template + projection.
3. Compute `estimateInputTokens(req)`. If estimate > `maxInputTokens`, return `{ skipReason: 'pre-flight token estimate exceeds cap (<estimate> > <cap>)' }`.
4. Compute cache key: `sha256(JSON.stringify({findings: projection, model: adapter.model, promptVersion: PROMPT_VERSION}))`.
5. If cache enabled and entry fresh: return `{ result: { ...cached, cacheHit: true } }`.
6. Call `adapter.chat(req, { maxOutputTokens, signal })`.
7. On `AdapterError`: return `{ skipReason: '<kind>: <message>' }`. Caller logs to stderr and continues.
8. Parse response body as JSON. Validate against `TriageResult` schema (label ≤80 chars, fixOrder ≥ 1, severity ∈ {info,warning,error,critical}, relatedFindingIds ⊆ assigned ids). On schema failure: `skipReason: 'LLM returned invalid TriageResult shape'`.
9. Compute `estimatedCostUsd` from `cost.ts` lookup table. May be `undefined`.
10. Cache the result. Return `{ result }`.

### Pipeline integration in `auditor.ts`

After the existing `enrichFindings` call, before formatter:

```ts
let triageResult: TriageResult | undefined;
if (options?.ai?.enabled) {
  const adapter = createAdapter(options.ai);
  const cacheConfig = options.ai.cache !== false
    ? { dir: options.ai.cache?.dir ?? '.pseolint/ai-cache', ttlMs: options.ai.cache?.ttlMs ?? 30 * 24 * 3600 * 1000 }
    : false;
  const { result, skipReason } = await triageFindings(enriched.findings, pages.length, {
    enabled: true,
    adapter,
    maxInputTokens: options.ai.maxInputTokens,
    maxOutputTokens: options.ai.maxOutputTokens,
    cache: cacheConfig,
  });
  if (skipReason) {
    console.error(`[ai-triage] skipped: ${skipReason}`);
  } else {
    triageResult = result;
  }
}
summary.triage = triageResult;
```

Discovery hint: when `ai.suggest !== false` AND `ANTHROPIC_API_KEY` is set AND `ai.enabled` is false, after the audit completes print to stderr:

```
💡 AI triage available, re-run with --ai to prioritize <N> findings into a fix list.
```

Cadence: printed at the end of every qualifying audit (no persistence, no per-directory state, keeps the implementation trivial). Users who find it noisy disable it once via `ai.suggest: false` in config or `--no-ai-suggest` per run.

### CLI surface

```
--ai                          Enable AI triage (default: off)
--ai-provider <id>            anthropic | ollama (default: anthropic if ANTHROPIC_API_KEY set, else ollama)
--ai-model <name>             Override default model
--ai-endpoint <url>           Override Ollama endpoint (default: http://localhost:11434)
--ai-max-tokens <n>           Input token cap per triage call (default: 60000)
--ai-cache-ttl <duration>     Triage cache TTL (default: 30d). Same parser as --cache-ttl.
--no-ai-cache                 Bypass cache for this run
--no-ai-suggest               Suppress discovery hint when key detected
```

### Config surface (`pseolint.config.{ts,js}`)

```ts
ai?: {
  enabled?: boolean;
  provider?: 'anthropic' | 'ollama';
  model?: string;
  endpoint?: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  suggest?: boolean;             // discovery hint, default: true
  cache?: { ttlMs?: number; dir?: string } | false;
}
```

CLI flags override config values via the existing `mergeOptions` pattern in `packages/cli/src/config.ts`.

### Output rendering

**Console formatter** (`packages/core/src/formatters/console.ts`): when `summary.triage` is present, render between summary stats and findings list:

```
─── AI Triage (claude-sonnet-4-6, cached) ─────────────
Top 3 root causes (847 findings → 3):
  1. Templating problem [structural, 612 findings]
     Your template lacks per-entity differentiation.
     Fixing here resolves 72% of findings.
  2. Schema gaps [moderate, 180 findings]
     Product pages missing JSON-LD price + availability.
  3. Author signals [quick, 55 findings]
     Add <meta name="author"> to base template.

Narrative: This site shows classic pSEO templating issues.
Fixing the template will eliminate most spam-rule violations.

47k in / 1.2k out  •  est $0.14  •  cache miss
───────────────────────────────────────────────────────
```

The `[<effort>, <count> findings]` bracket reuses the existing `effort` field on findings, for each root cause, effort is `max` over `relatedFindingIds`'s effort tags.

**JSON formatter** (`packages/core/src/formatters/json.ts`): include the full `triage` object as a top-level field. No transformation.

**Markdown formatter** (`packages/core/src/formatters/markdown.ts`):

```markdown
## AI Triage

> _Model: claude-sonnet-4-6 (cached). 47k in / 1.2k out, est $0.14._

This site shows classic pSEO templating issues. Fixing the template will eliminate most spam-rule violations.

| # | Root cause | Effort | Findings | Affected rules |
|---|---|---|---|---|
| 1 | Templating problem | structural | 612 | spam/near-duplicate, spam/entity-swap |
| 2 | Schema gaps | moderate | 180 | schema/required-fields |
| 3 | Author signals | quick | 55 | content/missing-author |

**1. Templating problem.** Your template lacks per-entity differentiation. Fixing here resolves 72% of findings.

**2. Schema gaps.** Product pages missing JSON-LD price + availability.

**3. Author signals.** Add `<meta name="author">` to base template.
```

**HTML formatter** (`packages/core/src/formatters/html.ts`): renders the same data as a styled card section above the existing findings table. Detailed visual styling (card layout, color tokens) follows the existing report aesthetic and is finalized during implementation rather than locked in this spec.

### Caching

- Directory: `.pseolint/ai-cache/` (sibling to `.pseolint/cache/`).
- File-per-entry: `<hash>.json`.
- Atomic write: `<hash>.json.tmp` then `rename`.
- Entry shape: the `TriageResult` plus `{cachedAt: ISO8601}`.
- TTL: default 30 days. On read: if `now - cachedAt > ttlMs`, treat as miss.
- Cache key includes `PROMPT_VERSION`: bumping the prompt template version auto-invalidates all entries.
- Bypass: `--no-ai-cache` or `cache: false` in config.

### Cost estimation

`packages/core/src/ai/cost.ts` exports a pure function:

```ts
export function estimateCostUsd(providerId: string, model: string, usage: TokenUsage): number | undefined;
```

Backed by a hardcoded pricing table (per 1M tokens, input/output) for known models. When the model is unknown (e.g., a custom Ollama tag), returns `undefined`. Pricing is stale-by-design, the field is labeled "est" everywhere it surfaces. Pricing table updates land in patch releases.

Initial table:
- `claude-sonnet-4-6`: $3.00 / $15.00 per 1M
- `claude-opus-4-7`: $15.00 / $75.00 per 1M
- `claude-haiku-4-5-20251001`: $0.80 / $4.00 per 1M
- All Ollama models: `undefined` (local, no billing)

### Failure modes (fail-open)

| Condition | Behavior |
|---|---|
| `ai.enabled: false` | Pipeline unchanged; no AI code loaded |
| Pre-flight estimate > cap | Skip triage; stderr warning; audit completes |
| `auth` error | Skip triage; stderr warning with hint to set `ANTHROPIC_API_KEY`; audit completes |
| `network` / `rate-limit` / `server` | Skip triage; stderr warning; audit completes |
| `sdk-missing` | Skip triage; stderr warning with `npm install @anthropic-ai/sdk` hint; audit completes |
| `invalid-response` (LLM returned non-JSON or wrong shape) | Skip triage; stderr warning; audit completes |
| Cache I/O error (read or write) | Treat as cache miss; do NOT block triage; warn once |
| Abort signal | Skip triage; no warning (intentional cancellation) |

In every failure case, the audit's exit code, JSON output (minus `triage` field), and findings list are unchanged. The findings list is the contract; AI is decoration.

### Testing strategy

- **Stub adapter** (`packages/core/tests/helpers/stub-adapter.ts`): implements `LlmAdapter` with deterministic, configurable responses. Used in all triage and integration tests.
- **Adapter unit tests** (`packages/core/tests/ai/adapters/anthropic.test.ts`, `ollama.test.ts`): mock at the SDK / fetch boundary. Verify error mapping for each `AdapterError.kind`.
- **Triage unit tests** (`packages/core/tests/ai/triage.test.ts`): cover happy path, schema validation rejection, pre-flight cap, cache hit/miss, all `AdapterError` kinds, abort handling, finding-count truncation at 200.
- **Prompt snapshot test**: assert the rendered prompt for a fixed input is byte-stable, so prompt changes are explicit and auto-invalidate the cache via `PROMPT_VERSION`.
- **Cache tests** (`packages/core/tests/ai/cache.test.ts`): mirror existing HTTP cache tests (atomic write, key collision, TTL expiry, malformed entry handling).
- **Integration test** (`packages/core/tests/integration/auditor-ai-triage.test.ts`): end-to-end `auditSource` with `ai.enabled: true` + stub adapter; asserts `summary.triage` populated and formatters render it.
- **Cost lookup tests**: known model returns expected number; unknown returns `undefined`; bad usage shape doesn't throw.
- **Zero live LLM calls in CI.** Documented in `CONTRIBUTING.md`.

### Migration / compat

- `AuditSummary.triage` is optional. Existing JSON consumers see no change unless they enable AI.
- New CLI flags are all opt-in; no existing flag changes meaning.
- `@anthropic-ai/sdk` is `peerDependenciesMeta.optional: true`. Users without it can still use Ollama or run without AI.
- `PROMPT_VERSION` semver: bump major on prompt restructure, minor on schema-affecting tweaks, patch on wording-only refinements. Cache key bumps invalidate all prior entries.

## Appendix: rejected alternatives

- **Triage in formatter layer.** Couples LLM call to render time, can't share output across formats, can't cache to JSON. Rejected.
- **Separate `@pseolint/ai-triage` package.** Install-friction kills adoption ("did you also install...?"). Rejected; revisit if AI surface grows past 3 features.
- **Auto-on when API key detected.** Surprise billing. Rejected; one-time discovery hint instead.
- **Dollar-based cap.** Pricing tables go stale; multi-provider math gets messy. Rejected for cap; kept as derived display info.
- **Streaming responses.** Triage is one terminal call producing structured JSON; streaming buys nothing. Rejected.
- **Multi-turn / tool-use adapter shape.** YAGNI for triage. The adapter interface stays single-turn; expanded if future features need it.
- **OpenAI in v1.** Same shape as Anthropic; adds zero design pressure on the interface. Trivially additive in v1.1.
- **Embeddings adapter in v1.** Different cost model and use case (semantic dedup, not triage). Separate adapter axis; revisit when first embeddings feature lands.
