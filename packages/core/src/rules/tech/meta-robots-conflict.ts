import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/meta-robots-conflict flags pages whose robots directives contradict
 * each other across the three places they can be declared: `<meta name="robots">`
 * tags, `<meta name="googlebot">` tags, and the `X-Robots-Tag` HTTP header.
 *
 * When directives conflict, Google applies the MOST RESTRICTIVE one
 * (https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag),
 * so an accidental `noindex` (e.g. left over from staging in a header while the
 * meta tag says `index`) silently wins and deindexes the page.
 *
 *   - error:   a directive and its opposite both appear (index vs noindex,
 *              follow vs nofollow) anywhere across the sources.
 *   - warning: the same meta name appears in 2+ tags with different content
 *              strings (ambiguous which one wins).
 *
 * Note: page.robotsMeta only holds the FIRST robots meta tag, so this rule
 * re-scans page.html to see every tag.
 */

interface RobotsDeclaration {
  /** Human-readable source label, e.g. `meta robots` or `X-Robots-Tag header`. */
  source: string;
  /** Meta name for duplicate detection ("robots" / "googlebot"), undefined for the header. */
  metaName?: string;
  /** Raw content string as declared. */
  content: string;
}

/** Extract every robots/googlebot meta declaration plus the X-Robots-Tag header. */
function gatherRobotsDeclarations(page: ParsedPage): RobotsDeclaration[] {
  const declarations: RobotsDeclaration[] = [];

  const metaTagRe = /<meta\b[^>]*>/gi;
  for (const [tag] of page.html.matchAll(metaTagRe)) {
    const nameMatch = /\bname\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
    const name = (nameMatch?.[2] ?? nameMatch?.[3] ?? nameMatch?.[4] ?? "").trim().toLowerCase();
    if (name !== "robots" && name !== "googlebot") continue;
    const contentMatch = /\bcontent\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
    const content = contentMatch?.[2] ?? contentMatch?.[3] ?? contentMatch?.[4] ?? "";
    declarations.push({ source: `meta ${name}`, metaName: name, content });
  }

  const xRobots = page.httpMeta?.xRobotsTag ?? "";
  if (xRobots.trim()) {
    declarations.push({ source: "X-Robots-Tag header", content: xRobots });
  }

  return declarations;
}

/** Normalize a robots content string into lowercase, trimmed directive tokens. */
function normalizeDirectives(content: string): string[] {
  return content
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
}

const OPPOSITE_PAIRS: Array<[string, string]> = [
  ["index", "noindex"],
  ["follow", "nofollow"],
];

export function metaRobotsConflictRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const declarations = gatherRobotsDeclarations(page);
    if (declarations.length === 0) continue;

    // Which sources declare each directive token.
    const directiveSources = new Map<string, Set<string>>();
    for (const decl of declarations) {
      for (const directive of normalizeDirectives(decl.content)) {
        let sources = directiveSources.get(directive);
        if (!sources) {
          sources = new Set();
          directiveSources.set(directive, sources);
        }
        sources.add(decl.source);
      }
    }

    // error: a directive and its opposite both appear somewhere.
    for (const [positive, negative] of OPPOSITE_PAIRS) {
      const posSources = directiveSources.get(positive);
      const negSources = directiveSources.get(negative);
      if (!posSources || !negSources) continue;

      findings.push({
        ruleId: "tech/meta-robots-conflict",
        severity: "error",
        confidence: "high",
        message: `${page.url} declares both "${positive}" (${[...posSources].join(", ")}) and "${negative}" (${[...negSources].join(", ")}). Google applies the most restrictive directive, so "${negative}" silently wins.`,
        pageUrl: page.url,
        fix: `Remove the unintended directive so all sources (meta robots, meta googlebot, X-Robots-Tag header) agree. If "${negative}" is accidental (e.g. a staging header that shipped to production), it is currently deindexing/restricting this page.`,
      });
    }

    // warning: same meta name declared in 2+ tags with different content strings.
    for (const metaName of ["robots", "googlebot"] as const) {
      const contents = declarations
        .filter((d) => d.metaName === metaName)
        .map((d) => d.content.trim().toLowerCase());
      const distinct = new Set(contents);
      if (contents.length >= 2 && distinct.size > 1) {
        findings.push({
          ruleId: "tech/meta-robots-conflict",
          severity: "warning",
          confidence: "high",
          message: `${page.url} has ${contents.length} <meta name="${metaName}"> tags with different content (${[...distinct].map((c) => `"${c}"`).join(" vs ")}); it is ambiguous which one wins.`,
          pageUrl: page.url,
          fix: `Keep a single <meta name="${metaName}"> tag; Google combines duplicates by applying the most restrictive directives found across them.`,
        });
      }
    }
  }

  return findings;
}
