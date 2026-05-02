import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { resolvePage } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageId: z.string().describe("Page reference returned by fetch_page."),
});

const REQUIRED_PROPERTIES_BY_TYPE: Record<string, string[]> = {
  Article: ["headline", "datePublished", "author"],
  NewsArticle: ["headline", "datePublished", "author"],
  BlogPosting: ["headline", "datePublished", "author"],
  Product: ["name"],
  FAQPage: ["mainEntity"],
  HowTo: ["name", "step"],
  Recipe: ["name", "recipeIngredient", "recipeInstructions"],
  Event: ["name", "startDate", "location"],
  Organization: ["name"],
  LocalBusiness: ["name", "address"],
  Person: ["name"],
  BreadcrumbList: ["itemListElement"],
  VideoObject: ["name", "description", "thumbnailUrl", "uploadDate"],
};

const outputSchema = z.object({
  url: z.string(),
  blocks: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      types: z.array(z.string()),
      hasContext: z.boolean(),
      missingRequired: z.array(z.string()),
      ok: z.boolean(),
    }),
  ),
  totalBlocks: z.number().int().nonnegative(),
  okBlocks: z.number().int().nonnegative(),
});

function typesOf(block: unknown): string[] {
  if (typeof block !== "object" || block === null) return [];
  const t = (block as { "@type"?: unknown })["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

export const validateJsonLdTool = defineTool({
  name: "validate_jsonld",
  description:
    "Validate JSON-LD blocks on a previously-fetched page against Schema.org required-property expectations (Article needs headline/datePublished/author; FAQPage needs mainEntity; Product needs name; Event needs name/startDate/location; etc.). Reports per-block missing fields. Use this to inform `add_jsonld` patch proposals.",
  inputSchema,
  outputSchema,
  async execute({ pageId }) {
    const entry = resolvePage(pageId);
    const parsed = parseHtmlPage(entry.html, entry.url);
    const blocks = parsed.jsonLd.map((block, index) => {
      if (typeof block !== "object" || block === null) {
        return { index, types: [], hasContext: false, missingRequired: [], ok: false };
      }
      const obj = block as Record<string, unknown>;
      const types = typesOf(block);
      const hasContext = obj["@context"] !== undefined;

      const missing = new Set<string>();
      for (const t of types) {
        const required = REQUIRED_PROPERTIES_BY_TYPE[t] ?? [];
        for (const prop of required) {
          if (obj[prop] === undefined) missing.add(prop);
        }
      }

      return {
        index,
        types,
        hasContext,
        missingRequired: Array.from(missing).sort(),
        ok: hasContext && missing.size === 0 && types.length > 0,
      };
    });

    return {
      url: parsed.url,
      blocks,
      totalBlocks: blocks.length,
      okBlocks: blocks.filter((b) => b.ok).length,
    };
  },
});
