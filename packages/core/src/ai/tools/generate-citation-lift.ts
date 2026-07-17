import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { resolvePage } from "../orchestrator/page-cache.js";
import { createLanguageModel } from "../adapters/index.js";
import { estimateCostUsd } from "../cost.js";
import {
  generateCitationBlock,
  makeCitationGenerate,
  draftToPageChanges,
} from "../../algorithms/citation-lift/index.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageId: z.string().describe("Page reference returned by fetch_page."),
  query: z
    .string()
    .min(1)
    .max(300)
    .describe(
      "The question this page targets — what a user asks an AI engine and should get this page cited for. Get it from the page's topic or a query_serp / ask_ai_engine probe.",
    ),
  attempts: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional()
    .describe("Best-of-N drafts by proxy citability score. Default 1; raise to 2-3 when the first draft scores low."),
  provider: z.string().optional().describe("AI provider override. Default: same env auto-detect as the session."),
  model: z.string().optional().describe("Model override. Default: provider default."),
  apiKey: z.string().optional().describe("API key override. Default: provider env var."),
});

const pageChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_faq_block"), html: z.string(), reason: z.string() }),
  z.object({ type: z.literal("add_jsonld"), block: z.record(z.string(), z.unknown()), reason: z.string() }),
]);

const outputSchema = z.object({
  /** Self-assessed citability 0-100 (proxy — engines score published pages, not drafts). */
  score: z.number(),
  answerFirst: z.string(),
  rationale: z.string(),
  /** Ready to drop straight into a page patch's `changes` array in finish_audit. */
  changes: z.array(pageChangeSchema),
  apiCostUsd: z.number().nonnegative(),
});

/**
 * AEO citation-lift generator, exposed as an orchestrator tool so the LLM can
 * emit lift patches directly into its manifest. Given a fetched page and the
 * query it targets, it drafts an answer-first block + FAQ (the shape answer
 * engines quote) and returns `add_faq_block` + FAQPage `add_jsonld` changes.
 *
 * Billable (one LLM call per attempt): the estimated cost is returned as
 * `apiCostUsd` so the session BudgetTracker counts it like query_serp /
 * ask_ai_engine. The self-score is a PROXY — the live citability probe
 * (ask_ai_engine) only scores published URLs, so verify the lift after the
 * fix ships, not here.
 */
export const generateCitationLiftTool = defineTool({
  name: "generate_citation_lift",
  description:
    "Generate AEO citation-lift patches for a page that AI answer engines don't cite: an answer-first block + FAQ (with FAQPage JSON-LD) tuned to be quoted for the target query. Returns ready-to-use `add_faq_block` + `add_jsonld` changes plus a 0-100 proxy citability score. Billable (~one LLM call per attempt); cost is reported in apiCostUsd. Use after finding a page with weak answer-first / citable-facts coverage.",
  inputSchema,
  outputSchema,
  async execute({ pageId, query, attempts, provider, model, apiKey }, ctx) {
    const entry = resolvePage(pageId);
    const parsed = parseHtmlPage(entry.html, entry.url);

    const resolved = await createLanguageModel({ provider, model, apiKey });
    let input = 0;
    let output = 0;
    const generate = makeCitationGenerate(resolved.model, ctx?.signal, (u) => {
      input += u.inputTokens;
      output += u.outputTokens;
    });

    const draft = await generateCitationBlock(
      { query, contentText: parsed.contentText ?? "", attempts },
      { generate, signal: ctx?.signal },
    );

    const apiCostUsd = estimateCostUsd(resolved.providerId, resolved.modelId, { input, output }) ?? 0;

    return {
      score: draft.score,
      answerFirst: draft.answerFirst,
      rationale: draft.rationale,
      changes: draftToPageChanges(draft),
      apiCostUsd,
    };
  },
});
