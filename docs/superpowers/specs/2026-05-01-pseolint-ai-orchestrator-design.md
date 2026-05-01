# pseolint AI Orchestrator — Architecture

**Date:** 2026-05-01
**Target version:** `@pseolint/core` v0.4.4 (additive minor; nothing in v0.4 public API breaks)
**Status:** DRAFT — pending decisions in §11
**Depends on:** v0.4 engine ships and proves the rule library; zero external users at time of writing
**Supersedes:** the AI-triage portion of `2026-04-18-ai-triage-and-adapter-design.md`

## 1. Problem statement

The current AI surface area in pseolint is one LLM call: a "triage" pass that paraphrases the existing rule library back at the user with a 1-2 sentence rationale. The model receives `ruleId / severity / message / pageUrl` — no page content, no schema, no GSC data, no cross-page context. The output is therefore generic SEO advice the rules already encode.

This is a low-ROI integration. It costs every audit a non-zero LLM bill, exposes hallucination risk on public third-party reports, and produces nothing that survives `findings.groupBy(f => f.ruleId.split("/")[0])` plus a templated rationale dictionary.

Meanwhile, the things AI is uniquely good at — grounded rewrite proposals, template-cluster anomaly detection, AEO citability probes against actual answer engines, GSC anomaly explanation — are all absent.

This spec assumes a context that disappears the day a single external user runs the SaaS in production: **zero install base, zero retention obligations, zero migration cost.** Every reshape in this spec is free today.

## 2. Reframe in one sentence

**The AI orchestrator turns pseolint into an AI-driven pSEO auditor that produces a fix manifest, not a report — rules become the LLM's fact-check tools rather than the engine itself.**

The conceptual flip:

- **v0.4**: deterministic rules engine + LLM triage bolt-on. Output: a list of findings.
- **v0.4.4 onward**: LLM orchestrator with rules-as-tools. Output: a manifest of concrete patches, alongside the existing report.

Every architectural decision in this spec follows from that flip. No public type in v0.4 changes; the orchestrator ships as new exports next to existing ones. SemVer remains in 0.x territory until a real user cohort validates the design.

## 3. Why this is the only window

The same logic that justified v0.4: at zero users every choice is free, and after the first paying user every choice locks in for years. The current architecture is good at shipping incremental AI features that mid-funnel-optimize a product that doesn't have a top-of-funnel yet. The orchestrator flip *is* the top-of-funnel — a launch story that says "we don't audit your pSEO, we patch it" pulls a different audience than "we have 32 rules that mean something."

Adjacent: [v0.4 engine redesign decision](./2026-04-29-pseolint-v0.4-engine-redesign.md) explicitly invoked zero-user freedom for breaking changes. This spec extends the same principle from "reshape the rules engine" to "add a new product surface on top of it."

## 4. The four architectural layers

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 3 — Output channels                                   │
│   • Live audit log (SSE) → web UI                            │
│   • Fix manifest (JSON + patch bundle) → R2                  │
│   • GitHub PR (deferred to a later iteration)                │
├──────────────────────────────────────────────────────────────┤
│  Layer 2 — Orchestrator (NEW)                                │
│   Opus 4.7 (1M ctx) + tool use, streaming loop               │
│   Inngest job, durable session log, budget guardrails        │
├──────────────────────────────────────────────────────────────┤
│  Layer 1 — Tool primitives                                   │
│   fetch_page, fetch_sitemap, detect_templates,               │
│   check_rule, check_all_rules, validate_jsonld,              │
│   query_serp [NEW], ask_ai_engine [NEW],                     │
│   compute_text_metrics, check_robots, sample_template        │
├──────────────────────────────────────────────────────────────┤
│  Layer 0 — Existing pseolint engine (v0.4)                   │
│   Rules, crawler, template detection, R2 storage,            │
│   Inngest, BYOK, Drizzle schema, audit DB, Stripe            │
└──────────────────────────────────────────────────────────────┘
```

Bottom three layers are **reused** from current code. Layer 2 is new. Layer 3 is mostly new UI on existing R2/Inngest infrastructure.

## 5. Tool registry (Layer 1)

Each tool is a TypeScript function exposed via the Vercel `ai` SDK's tool-use API with strict input/output schemas (Zod, validated at the registry boundary). Tools are deterministic and individually cacheable; the LLM's path through them varies per-domain.

| Tool | Reuses existing code | New work |
|---|---|---|
| `fetch_page(url)` | `cachedFetch` + `validateTargetHost` (SSRF guard) | thin wrapper |
| `fetch_sitemap(domain)` | sitemap reader | thin wrapper |
| `detect_templates(urls)` | `clusterUrlTemplates` | thin wrapper |
| `sample_template(id, n)` | existing | thin wrapper |
| `check_rule(ruleId, page)` | each pseolint rule | per-rule tool schema (~32 rules in v0.4) |
| `check_all_rules(page)` | existing audit | thin wrapper |
| `validate_jsonld(html)` | partial | finish + schema.org validator |
| `compute_text_metrics(html, siblings)` | partial | uniqueness vs sibling pages in same template |
| `check_robots(url)` | existing | thin wrapper |
| `check_indexability(url)` | existing | thin wrapper |
| `query_serp(keyword, locale)` | — | **NEW** — SerpAPI integration |
| `ask_ai_engine(query, engine)` | — | **NEW** — Anthropic + Perplexity Sonar + Gemini probes |

`query_serp` and `ask_ai_engine` are the only new external integrations. Everything else wraps what exists.

**Schema convention**: every tool's input + output is a Zod schema in `packages/core/src/ai/tools/<tool>.ts`. The registry composes them into the AI-SDK `tools` parameter at session start. Keeps tool contracts type-checkable end-to-end.

## 6. Orchestrator (Layer 2)

Single agent. Multi-agent (planner + auditor + fixer) was considered and rejected — it adds 2-3x latency and token cost for marginal quality gain at this stage of product maturity. Single agent with a strong system prompt and well-designed tools wins.

**Implementation note**: pseolint already uses the Vercel `ai` SDK (`packages/core` peer-deps `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, etc.). The orchestrator uses `streamText` with tools — provider-agnostic from day one, so BYOK across providers works natively without per-provider tool-format conversion. The spec assumes Anthropic Opus 4.7 as the default (1M ctx, prompt caching), but nothing pins the orchestrator to it.

### 6.1 System prompt structure

Cached aggressively where the provider supports it (Anthropic prompt caching — 5-min TTL, ~$0.30/M cached read vs $3/M fresh; other providers use whatever caching the `ai` SDK exposes):

1. **Role**: "You audit programmatic SEO surfaces and produce a fix manifest."
2. **Tool list with schemas** (~5K tokens, fully cached).
3. **Budget contract**: max 100 tool calls, 500K input tokens, $5 USD, 5 min wall.
4. **Output contract**: must call `finish_audit(manifest)` to terminate.
5. **Methodology hints** (not script): "start with sitemap, identify templates, sample 3-5 per template, run rules, escalate to AI-engine probes for AEO checks, propose fixes." Hints are guidance — the LLM picks order.

### 6.2 Loop

```ts
const session = await createSession({ domain, userId, budget });
const stream = await streamText({
  model,                           // resolved via createLanguageModel (existing)
  system: SYSTEM_PROMPT,           // cached on Anthropic; no-op elsewhere
  tools: orchestratorTools,        // registry as { name: tool } map
  messages: session.history,
  stopWhen: ({ toolCalls }) =>
    toolCalls.some((c) => c.toolName === "finish_audit") ||
    session.budgetExceeded(),
  onStepFinish: ({ toolCalls, toolResults, text, usage }) => {
    for (const c of toolCalls) session.streamToUI({ kind: "tool_call", tool: c.toolName, input: c.input });
    for (const r of toolResults) session.streamToUI({ kind: "tool_result", tool: r.toolName, result: r.output });
    if (text) session.streamToUI({ kind: "thought", text });
    session.recordUsage(usage);
  },
});
const final = await stream.finalToolCall("finish_audit");
session.finish(final?.input.manifest ?? null);
```

The `ai` SDK handles streaming, tool dispatch, and provider-specific formatting. Our code owns: budget tracking, session log persistence, UI streaming, and the `finish_audit` terminal tool.

### 6.3 Durable session log

Every tool call + result + LLM message persisted to R2 as `sessions/<id>/log.ndjson`. Buys reproducibility, debugging, and a "see what the auditor saw" feature later. Same blob is the source of truth for the live audit log UI.

### 6.4 Watchdog

Every 20 tool calls, inject a system message: *"Are you converging on a manifest? If not, summarize remaining gaps and finish. Hard cap at 100 calls."* Prevents infinite loops without a timeout-based kill that loses partial progress.

### 6.5 Budget enforcement

Pre-flight estimate before each tool call. If projected total cost would exceed `max_session_usd`, refuse the call and inject *"budget reached, finish with current findings."* Hard caps:
- `max_tool_calls`: 100
- `max_input_tokens_total`: 500_000
- `max_session_usd`: 5.00 (Pro managed); free tier requires BYOK so the budget cap is enforced against the user's own provider quota rather than ours (we still cap to prevent runaway, default $5/session, user-overridable)
- `max_wall_seconds`: 300

## 7. Fix manifest (Layer 3)

The artifact. This is the orchestrator's actual deliverable.

### 7.1 Schema

```ts
type FixManifest = {
  schemaVersion: "2026-05-v0.4.4";
  domain: string;
  generatedAt: string;       // ISO 8601
  sessionId: string;         // links to log.ndjson
  cost: { tokensIn: number; tokensOut: number; usd: number };

  templates: TemplatePatch[];     // per-template recommendations
  pages: PagePatch[];             // per-page concrete diffs
  domainLevel: DomainPatch[];     // robots.txt, sitemap.xml, etc.

  evidence: ToolCallRef[];        // links into the session log

  // Carried forward from v0.4 for back-compat with the legacy /r/<slug> view
  verdict: "ready" | "caution" | "concerning" | "critical";
  categories: { integrity: Grade; discoverability: Grade; citation: Grade; data: Grade };
};

type PagePatch = {
  url: string;
  changes: Array<
    | { type: "replace_h1";       before: string; after: string; reason: string }
    | { type: "rewrite_meta";     field: "title" | "description"; before: string; after: string; reason: string }
    | { type: "add_jsonld";       block: object; reason: string }
    | { type: "add_faq_block";    html: string; reason: string }
    | { type: "rewrite_intro";    before: string; after: string; reason: string }
    | { type: "add_internal_link"; from: string; to: string; anchor: string; reason: string }
    | { type: "remove_thin_block"; selector: string; reason: string }
  >;
};

type TemplatePatch = {
  templateId: string;
  affectedUrlCount: number;
  recommendation: string;       // 1-2 sentences
  examples: Array<{ url: string; changes: PagePatch["changes"] }>;
  rationale: string;
};

type DomainPatch = {
  type: "robots_txt" | "sitemap_xml" | "canonical_strategy";
  before: string | null;
  after: string;
  reason: string;
};
```

### 7.2 Patch validators

Every LLM-proposed patch passes a deterministic validator before landing in the manifest. Reject + retry up to 2x; on third failure drop the patch with a logged warning.

| Patch type | Validator |
|---|---|
| `add_jsonld` | schema.org JSON-LD parser; validates required properties for declared type |
| `replace_h1`, `rewrite_meta` | length + character set; not empty; no markdown leakage |
| `add_faq_block` | HTML parser; only safe tags; XSS-clean (use DOMPurify on server) |
| `rewrite_intro` | length 50-500 chars; no promo CTAs; preserves topical anchor |
| `add_internal_link` | `to` URL must exist on the audited domain (not 404) |
| `robots_txt` | `robots-parser` round-trip — must parse cleanly |
| `sitemap_xml` | XML schema validation against sitemap.org/0.9 |

### 7.3 Output channels

1. **Web UI manifest view** at `/m/<slug>` — scrollable cards per change with "evidence" links into the session log. Copy-paste buttons per patch.
2. **ZIP download** — `manifest.json` + `patches/<page>.html.diff` (unified diff format) for users who want to apply offline.
3. **(later) GitHub PR** — pseolint app installation, opens a PR with the diffs against a code-managed site's repo.

## 8. Migration map

### 8.1 Reuse as-is

- Rules engine (each rule wrapped as `check_rule` tool input).
- Crawler + sitemap reader → `fetch_page`, `fetch_sitemap` tools.
- Template detection → `detect_templates`, `sample_template` tools.
- R2 storage (now stores session logs + manifests instead of/in addition to summaries).
- Inngest infrastructure (orchestrator runs as an Inngest job).
- Drizzle schema (extends with `sessions` and `manifests` tables, see §9).
- BYOK plumbing (now load-bearing — see §10).
- Auth, monitoring scheduler, weekly digest infra, Stripe.

### 8.2 Refactor into tools

- Each individual rule (becomes a tool entry).
- Audit summary builder (becomes the manifest builder).
- v0.4 finding-bucket projection (becomes the legacy report-mode renderer; see §8.4).

### 8.3 Delete

- Current `triage()` LLM call (`packages/core/src/ai/triage.ts`) — replaced by orchestrator.
- Current `triagePayloadSchema` and the prompt at `packages/core/src/ai/prompt.ts` — replaced by orchestrator system prompt.
- `apps/web/src/app/api/audits/[id]/triage/route.ts` — replaced by orchestrator session API.
- `audits.triageRootCauseCount`, `audits.triageCostUsd` columns — clean delete; the new `sessions` table tracks orchestrator cost in `spentUsd` instead.

These deletes are internal: no external consumer of `@pseolint/core` is wired to them, so v0.4.4 stays a minor bump.

### 8.4 Keep but demote

- v0.4 `/r/<slug>` report view — marked "legacy report mode" for users who just want findings without the manifest. The manifest view at `/m/<slug>` is the new primary surface. Eventually retired but no rush.
- v0.4 audit pipeline (rules → findings → summary) — runs as the *first* tool the orchestrator typically calls. The orchestrator can short-circuit to it for "I just want the report" users via a flag.

## 9. Database changes

**Anonymous orchestrator runs**: not supported in v0.4.4. Free tier requires login + a BYOK key for orchestrator runs (no place to put a key for anon users; legacy v0.4 audit at `/r/<slug>` remains the anon entry point). `userId` is non-nullable in the `sessions` table.

```ts
// New tables
sessions: {
  id: uuid (pk),
  userId: text (fk, NOT NULL),
  domain: text,
  status: "queued" | "running" | "completed" | "failed" | "aborted",
  budgetUsd: decimal,
  spentUsd: decimal,
  toolCallCount: integer,
  startedAt: timestamp,
  completedAt: timestamp | null,
  logKey: text,          // R2 key for log.ndjson
  manifestKey: text | null, // R2 key for manifest.json
  createdAt: timestamp,
}

manifests: {
  id: uuid (pk),
  sessionId: uuid (fk),
  slug: text (unique),    // for /m/<slug> URLs
  schemaVersion: text,
  verdict: text,
  pagePatchCount: integer,
  templatePatchCount: integer,
  domainPatchCount: integer,
  isPublic: boolean (default false),
  expiresAt: timestamp,
  createdAt: timestamp,
}
```

The existing `audits` table stays — v0.4 audits still flow through it, and the orchestrator can write a row there when it runs the legacy-audit tool, for free continuity.

## 10. BYOK becomes load-bearing

In v0.4, BYOK was a hedge for power users who wanted to bypass the (cheap) triage quota. With the orchestrator it's the primary cost-control primitive:

- **Free tier**: orchestrator runs only with a user-supplied API key. Zero managed AI cost.
- **Pro tier**: managed orchestrator runs (we eat $3-5/audit) + optional BYOK to bypass managed quotas for unlimited Pro audits.

The existing key vault (AES-256-GCM at rest, per `apps/web/src/lib/secret-box.ts`) is re-used. The BYOK page copy needs a rewrite — it's no longer "save a few cents on triage," it's "unlock orchestrator audits without paying our managed price."

## 11. Open questions / decisions needed before Phase 1 starts

These gate the eng plan and need explicit answers:

1. **Pricing** — stay $19/mo, bump to $49/mo, or $0 free + $49 Pro with no middle? Recommendation: $49 Pro (the value step is real).
2. **Free-tier orchestrator** — BYOK-only, or managed with hard $0.50/session cap? Recommendation: BYOK-only on free.
3. **GitHub PR mode** — ship now or later? Recommendation: later (saves ~3 weeks; patch download is enough demo).
4. **SERP source** — SerpAPI ($75/mo / 5K calls) vs Bright Data vs scraping? Recommendation: SerpAPI to start, switch only if volume forces.
5. **Brand** — keep "pseolint" with new positioning, or rename (e.g. `pseofix`, `pseopatch`)? Decision needed before launch copy is written.
6. **Model strategy** — Opus 4.7 throughout vs Opus for synthesis + Sonnet 4.6 for routine tool calls? Recommendation: Opus throughout to start; cost delta is rounding error pre-PMF and quality gap shows on long tool sequences.
7. **Public-share shape** — manifests contain LLM rewrites for third-party sites. Decision: public `/m/<slug>` shows only deterministic findings + paraphrased summary (verdict, categories, finding counts). Owner-only sees the actual rewrites + diffs. Curated audits in `/research/` get explicit owner permission first.
8. **Legacy v0.4 `/r/<slug>` report** — keep alongside `/m/<slug>` or retire on launch? Recommendation: keep — nothing to gain by killing it, costs ~0.

## 12. Eng plan, sized

Solo developer, focused execution. Total ~9 eng-weeks; calendar ~10-12 weeks with normal scope creep.

| Phase | Scope | Eng-weeks |
|---|---|---|
| 1 | **Tool layer**: wrap every rule + crawler + template detection as Anthropic tools with Zod schemas + tests | 1.5 |
| 2 | **Orchestrator MVP**: streaming loop, session log to R2, budget enforcement, single-agent prompt, watchdog | 2.0 |
| 3 | **New external tools**: `query_serp` (SerpAPI) + `ask_ai_engine` (Anthropic, Perplexity Sonar, Gemini) + caching layer | 1.0 |
| 4 | **Fix manifest**: schema, patch builders for top ~8 patch types, validators (DOMPurify, schema.org, robots-parser, sitemap XSD) | 1.5 |
| 5 | **Web UI**: live audit log via SSE, manifest view at `/m/<slug>`, evidence drill-in, cost meter, copy-paste apply UI | 1.5 |
| 6 | **Hardening**: abort/retry, BYOK orchestrator key wiring, abuse rate limits, public-report safety projection (§11.7) | 1.0 |
| 7 | **Launch prep**: run on 20 famous pSEO sites, write `/research/state-of-pseo-2026-fixes`, pricing update, onboarding flow rewrite | 0.5 |

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Orchestrator stalls / loops | Hard tool-count cap (100), watchdog every 20 calls, max wall (300s) |
| LLM-generated patch quality | Deterministic validators (§7.2) — schema.org parser, DOMPurify HTML, robots-parser, sitemap XSD. Reject + retry 2x; on 3rd failure drop with logged warning. |
| SERP/AI-engine ToS exposure | SerpAPI is contractually fine. Anthropic + Gemini APIs explicitly allow this. Perplexity Sonar — confirm citation testing is in-scope before depending on it; have a plan to drop Perplexity probe and rely on Anthropic + Gemini only. |
| Cost predictability | `max_session_usd` from day one; surface live cost meter; pre-flight estimate per tool call. Pro pricing assumes ≤$3/audit average — alert if real-world drift exceeds $4. |
| Live audit log UX | Half the demo. Allocate Phase 5 budget to making SSE feel fluid (debounce, batch tool-result rendering, smooth scroll). Devin/Manus-quality bar. |
| Libel surface on public manifests | Public-shape projection (§11.7): paraphrase-only, no LLM-generated claims about third-party sites in publicly-indexed URLs. Owner-only sees rewrites. |
| Patch-apply confusion (HTML diffs against possibly-rendered pages) | Ship diffs *and* full-replacement blocks for each change. Diffs for code-savvy users; blocks for paste-into-CMS users. Later GitHub PR mode resolves the confusion at source. |
| Rule false-positive amplification | The LLM reads rule output and may double down on a wrong-but-confident rule firing, producing a "fix" for a non-problem. Mitigation: existing v0.4 `confidence` field on `RuleResult` (`high` / `medium` / `low` / `speculative`) is exposed in the `check_rule` tool output; system prompt instructs the LLM to weight low/speculative findings less and to cross-check with `compute_text_metrics` before proposing structural rewrites. |

## 14. Launch artifact

Day -7: orchestrator runs against 20 famous pSEO sites (Notion templates, Zapier integrations, Webflow showcases, Carrd themes, Tiermaker categories, etc.). Manifests stored. Curated subset published with explicit (or fair-use, depending on §11.7) consent.

Day 0: launch tweet thread.

> Most pSEO audits give you a list. We give you the patch.
>
> We ran pseolint against the 20 biggest programmatic SEO sites in the wild. The orchestrator opened 3,400+ proposed fixes — concrete H1 rewrites, missing JSON-LD blocks, internal-link gaps. Top 10 most surprising findings 👇
>
> [thread]
>
> Try it on your domain → pseolint.dev

The research page is the SEO content asset and the demo simultaneously. Same artifact serves both jobs.

## 15. Success criteria

- **Functional**: orchestrator completes within budget on 95% of audits against the v0.4 dogfood corpus.
- **Quality**: at least 80% of LLM-proposed patches pass deterministic validators on first emit.
- **Cost**: average managed-tier audit cost ≤ $3.
- **UX**: manifest view rated as more useful than the legacy `/r/<slug>` report by ≥3 of the first 5 external users.
- **Demo**: launch thread reaches ≥10K impressions on SEO Twitter within 7 days. (This is the actual PMF gate — quality of the audit is necessary but not sufficient; the launch needs to land.)

## 16. What is intentionally NOT in v0.4.4

- **GitHub PR generation** — deferred to a later iteration.
- **Multi-agent orchestration** — single agent ships first; revisit only if quality plateaus.
- **Auto-fix application via API/webhook** — out of scope; users apply patches manually or via a future GitHub mode.
- **Custom rule authoring via natural language** — "tell pseolint about my brand voice in plain English" is a tempting feature but a separate product surface; keep the launch focused.
- **Audit-level chat ("ask the auditor")** — costs are unpredictable; revisit when there's signal demand.
- **Auto-fix on user's own pSEO templates without human review** — never. Human-in-the-loop is part of the product, not a limitation to remove.
