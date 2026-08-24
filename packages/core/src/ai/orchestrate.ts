import type { LanguageModel } from "ai";
import { createLanguageModel } from "./adapters/index.js";
import {
  validateManifest,
  type ManifestValidationReport,
} from "./manifest/validate-manifest.js";
import { diffManifest, type ManifestDiff } from "./manifest/diff.js";
import { runOrchestrator } from "./orchestrator/runner.js";
import type { FixManifest } from "./orchestrator/finish-tool.js";
import type { EventSink } from "./orchestrator/log.js";
import type { BudgetCaps, SessionResult } from "./orchestrator/types.js";
import type { AiOptions } from "../types.js";

export interface OrchestrateOptions {
  /** Site to audit. Origin (e.g. https://example.com) is fine; the orchestrator's first move is fetching the sitemap. */
  domain: string;
  /** Caller identity. Persisted on the session row in the web app's DB; stub allowed for CLI/dogfood use. */
  userId: string;
  /**
   * AI provider configuration. Falls through to `createLanguageModel`'s
   * auto-detection when omitted (env-var based: `ANTHROPIC_API_KEY`, etc.).
   */
  ai?: AiOptions;
  /** Override default budget caps. Merge with `DEFAULT_BUDGET`. */
  budget?: Partial<BudgetCaps>;
  /**
   * Optional operator focus note appended to the system prompt: e.g. a prior
   * triage's root causes. Scopes the run toward a known diagnosis instead of
   * re-deriving everything blind. Truncated to keep the prompt bounded.
   */
  brief?: string;
  /** Optional path for durable NDJSON session log. */
  ndjsonPath?: string;
  /** Optional event sink: SSE/R2 fanout in the web app, console.log in the CLI. */
  onEvent?: EventSink;
  /** External abort signal. */
  signal?: AbortSignal;
  /** Per-model-call retry count for transient errors. Default 2. */
  maxRetries?: number;
  /**
   * @internal Test-only escape hatch: inject a pre-resolved model to skip
   * `createLanguageModel`. Production callers always go through `ai`.
   */
  _resolvedModel?: { model: LanguageModel; providerId: string; modelId: string };
}

export interface OrchestrateResult {
  /** Raw session output: events, usage, stop reason. */
  session: SessionResult;
  /** Final manifest if the LLM called `finish_audit`; null otherwise. */
  manifest: FixManifest | null;
  /** Patch-by-patch validation report. Null when no manifest was produced. */
  validation: ManifestValidationReport | null;
  /** Structured diff projection of the manifest. Null when no manifest was produced. */
  diff: ManifestDiff | null;
}

/**
 * Public entry point that ties Phases 1–6 together. One call audits a
 * domain, validates every patch, and emits structured diffs:
 *
 * ```ts
 * const { manifest, validation, diff } = await orchestrate({
 *   domain: "https://example.com",
 *   userId: "demo",
 *   onEvent: (e) => console.log(e),
 * });
 * ```
 *
 * Composition (the elegant part):
 *   1. Resolve provider via existing `createLanguageModel`
 *   2. Drive the LLM tool loop via `runOrchestrator`
 *   3. Validate every patch the LLM proposed via `validateManifest`
 *   4. Produce structured diffs for every patch via `diffManifest`
 *
 * Each layer is independently testable; this function exists to give
 * callers (web app, CLI, MCP, scripts) one stable API surface.
 *
 * Returns null `manifest`/`validation`/`diff` when the session terminated
 * for any reason other than `finish_audit` (budget breach, abort, error).
 * Callers should branch on `session.reason` to handle these.
 */
export async function orchestrate(opts: OrchestrateOptions): Promise<OrchestrateResult> {
  const resolved = opts._resolvedModel ?? (await createLanguageModel(opts.ai ?? {}));

  const session = await runOrchestrator({
    domain: opts.domain,
    userId: opts.userId,
    model: resolved.model,
    providerId: resolved.providerId,
    modelId: resolved.modelId,
    budget: opts.budget,
    brief: opts.brief,
    ndjsonPath: opts.ndjsonPath,
    onEvent: opts.onEvent,
    signal: opts.signal,
    maxRetries: opts.maxRetries,
  });

  if (!session.manifest) {
    return { session, manifest: null, validation: null, diff: null };
  }

  return {
    session,
    manifest: session.manifest,
    validation: validateManifest(session.manifest),
    diff: diffManifest(session.manifest),
  };
}
