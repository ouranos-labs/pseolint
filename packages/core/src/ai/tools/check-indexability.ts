import { z } from "zod";
import { parseHtmlPage } from "../../parser.js";
import { resolvePage } from "../orchestrator/page-cache.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  pageId: z.string().describe("Page reference returned by fetch_page."),
  xRobotsTagHeader: z
    .string()
    .optional()
    .describe(
      "Value of the X-Robots-Tag HTTP response header (if present). The orchestrator should pull this from the fetch_page result's `headers['x-robots-tag']`.",
    ),
});

const outputSchema = z.object({
  url: z.string(),
  indexable: z.boolean().describe("Final indexability verdict combining meta robots, X-Robots-Tag, and canonical."),
  reasons: z.array(z.string()).describe("Reasons the page is non-indexable, when applicable."),
  metaRobots: z.string(),
  metaNoindex: z.boolean(),
  xRobotsNoindex: z.boolean(),
  canonicalUrl: z.string(),
  canonicalSelfReferencing: z.boolean(),
});

function parseRobotsDirectives(value: string): { noindex: boolean; nofollow: boolean } {
  const lower = value.toLowerCase();
  return {
    noindex: /\bnoindex\b|\bnone\b/.test(lower),
    nofollow: /\bnofollow\b|\bnone\b/.test(lower),
  };
}

export const checkIndexabilityTool = defineTool({
  name: "check_indexability",
  description:
    "Determine whether a previously-fetched page is indexable by search engines. Combines <meta name=robots>, X-Robots-Tag (pass from fetch_page response headers), and canonical signals. Returns `indexable: false` with reasons when noindex or non-self-referencing canonical is present. Call this near the top of any per-page audit — non-indexable pages don't need rule checks.",
  inputSchema,
  outputSchema,
  async execute({ pageId, xRobotsTagHeader }) {
    const entry = resolvePage(pageId);
    const parsed = parseHtmlPage(entry.html, entry.url);
    // If the caller didn't pass X-Robots-Tag, pull it from the cached fetch
    // headers — saves the LLM a round-trip just to surface a header it
    // already saw in fetch_page's output.
    const xRobots = xRobotsTagHeader ?? entry.headers["x-robots-tag"] ?? "";
    const reasons: string[] = [];

    const meta = parseRobotsDirectives(parsed.robotsMeta);
    if (meta.noindex) reasons.push(`<meta name="robots"> contains noindex`);

    const xRobotsParsed = xRobots ? parseRobotsDirectives(xRobots) : { noindex: false, nofollow: false };
    if (xRobotsParsed.noindex) reasons.push(`X-Robots-Tag header contains noindex`);

    const canonicalSelfReferencing = parsed.canonical === parsed.url || parsed.canonical === "";
    if (parsed.canonical && !canonicalSelfReferencing) {
      reasons.push(`canonical points to ${parsed.canonical} (not self-referencing)`);
    }

    return {
      url: parsed.url,
      indexable: !meta.noindex && !xRobotsParsed.noindex && canonicalSelfReferencing,
      reasons,
      metaRobots: parsed.robotsMeta,
      metaNoindex: meta.noindex,
      xRobotsNoindex: xRobotsParsed.noindex,
      canonicalUrl: parsed.canonical,
      canonicalSelfReferencing,
    };
  },
});
