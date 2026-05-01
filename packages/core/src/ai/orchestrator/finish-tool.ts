import { z } from "zod";
import { defineTool } from "../tools/types.js";

/**
 * Manifest schema. Mirrors the spec at §7.1 of the orchestrator design doc.
 * Patch unions are kept narrow to constrain LLM output — adding a new patch
 * type is an explicit migration here + a new validator in Phase 4.
 */
const verdictSchema = z.enum(["ready", "caution", "concerning", "critical"]);
const gradeSchema = z.enum(["A", "B", "C", "D", "F"]);

const pageChangeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replace_h1"),
    before: z.string(),
    after: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("rewrite_meta"),
    field: z.enum(["title", "description"]),
    before: z.string(),
    after: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("add_jsonld"),
    block: z.record(z.string(), z.unknown()),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("add_faq_block"),
    html: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("rewrite_intro"),
    before: z.string(),
    after: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("add_internal_link"),
    from: z.string().url(),
    to: z.string().url(),
    anchor: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("remove_thin_block"),
    selector: z.string(),
    reason: z.string(),
  }),
]);

const pagePatchSchema = z.object({
  url: z.string().url(),
  changes: z.array(pageChangeSchema),
});

const templatePatchSchema = z.object({
  templateId: z.string(),
  affectedUrlCount: z.number().int().nonnegative(),
  recommendation: z.string(),
  examples: z.array(
    z.object({
      url: z.string().url(),
      changes: z.array(pageChangeSchema),
    }),
  ),
  rationale: z.string(),
});

const domainPatchSchema = z.object({
  type: z.enum(["robots_txt", "sitemap_xml", "canonical_strategy"]),
  before: z.string().nullable(),
  after: z.string(),
  reason: z.string(),
});

const manifestSchema = z.object({
  domain: z.string(),
  verdict: verdictSchema,
  categories: z.object({
    integrity: gradeSchema,
    discoverability: gradeSchema,
    citation: gradeSchema,
    data: gradeSchema,
  }),
  templates: z.array(templatePatchSchema),
  pages: z.array(pagePatchSchema),
  domainLevel: z.array(domainPatchSchema),
  /** Free-text summary for the orchestrator UI. Optional — dashboard can synthesize one. */
  summary: z.string().optional(),
});

const inputSchema = z.object({
  manifest: manifestSchema,
});

const outputSchema = z.object({
  accepted: z.literal(true),
});

export type FixManifest = z.infer<typeof manifestSchema>;

/**
 * Terminal tool. The orchestrator MUST call this to close out the session;
 * the runner detects the call and stops the LLM loop. Validation happens
 * via Zod at the tool boundary — a malformed manifest produces an
 * OUTPUT_VALIDATION error and the LLM gets to retry within budget.
 *
 * The execute() body is a no-op acknowledgement; the runner pulls the
 * manifest from the input arg, not the return value. We still emit
 * `accepted: true` as the tool result so the LLM gets confirmation.
 */
export const finishAuditTool = defineTool({
  name: "finish_audit",
  description:
    "Terminate the audit session and emit the final fix manifest. Required: call this exactly once, with the full manifest as input. The runner stops the LLM loop on this call. Manifest must include `domain`, `verdict`, `categories`, plus the three patch arrays (templates, pages, domainLevel) — empty arrays are fine when there's nothing actionable in that bucket.",
  inputSchema,
  outputSchema,
  async execute() {
    return { accepted: true as const };
  },
});

export { manifestSchema };
