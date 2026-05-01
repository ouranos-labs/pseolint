import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { resolvePage } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageId: z.string().describe("Page reference returned by fetch_page."),
});

/**
 * Trimmed projection of `ParsedPage`. The full parser shape is broader than
 * what the LLM benefits from seeing on every parse — we surface the fields
 * that drive AEO / schema / content rules and let dedicated tools dig deeper
 * when the model asks (validate_jsonld, compute_text_metrics).
 */
const outputSchema = z.object({
  url: z.string(),
  title: z.string(),
  metaDescription: z.string(),
  canonical: z.string(),
  robotsMeta: z.string(),
  headings: z.object({
    h1: z.array(z.string()),
    h2: z.array(z.string()),
  }),
  contentWordCount: z.number().int().nonnegative(),
  jsonLdBlockCount: z.number().int().nonnegative(),
  jsonLdTypes: z.array(z.string()),
  outboundLinkCount: z.number().int().nonnegative(),
  internalLinkCount: z.number().int().nonnegative(),
  hasAuthorSignal: z.boolean(),
  hasFaqBlock: z.boolean(),
});

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Pull `@type` from a JSON-LD block — handles string, array, and missing cases. */
function jsonLdTypesOf(block: unknown): string[] {
  if (typeof block !== "object" || block === null) return [];
  const t = (block as { "@type"?: unknown })["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

/**
 * Parse a previously-fetched page into the LLM-facing projection. Resolves
 * the `pageId` against the session-scoped page cache (populated by
 * fetch_page); the HTML itself never travels through the LLM conversation.
 *
 * For deeper analysis (text uniqueness, schema validation), use the
 * dedicated tools: validate_jsonld, compute_text_metrics.
 */
export const parsePageTool = defineTool({
  name: "parse_page",
  description:
    "Parse a previously-fetched page (referenced by pageId) into structured fields: title, meta, canonical, headings, word count, JSON-LD types, link counts, author + FAQ presence. Call after fetch_page. For Schema.org compliance use validate_jsonld; for cross-sibling text uniqueness use compute_text_metrics.",
  inputSchema,
  outputSchema,
  async execute({ pageId }) {
    const entry = resolvePage(pageId);
    const parsed = parseHtmlPage(entry.html, entry.url);

    let internalHost = "";
    try {
      internalHost = new URL(entry.url).hostname;
    } catch {
      // Non-URL `url` (e.g. file path) — every link counts as internal.
    }

    let internal = 0;
    let external = 0;
    for (const href of parsed.resolvedHrefs) {
      try {
        const host = new URL(href).hostname;
        if (internalHost === "" || host === internalHost) internal++;
        else external++;
      } catch {
        // Already-resolved relative path — treat as internal.
        internal++;
      }
    }

    const allTypes = parsed.jsonLd.flatMap(jsonLdTypesOf);
    const uniqueTypes = Array.from(new Set(allTypes));

    const sig = parsed.authorSignals;
    const hasAuthorSignal =
      sig.metaAuthor !== "" || sig.schemaAuthor || sig.bylineElement || sig.relAuthorLink;

    return {
      url: parsed.url,
      title: parsed.title,
      metaDescription: parsed.metaDescription,
      canonical: parsed.canonical,
      robotsMeta: parsed.robotsMeta,
      headings: {
        h1: parsed.headings.h1,
        h2: parsed.headings.h2,
      },
      contentWordCount: countWords(parsed.contentText),
      jsonLdBlockCount: parsed.jsonLd.length,
      jsonLdTypes: uniqueTypes,
      outboundLinkCount: external,
      internalLinkCount: internal,
      hasAuthorSignal,
      hasFaqBlock: uniqueTypes.includes("FAQPage"),
    };
  },
});
