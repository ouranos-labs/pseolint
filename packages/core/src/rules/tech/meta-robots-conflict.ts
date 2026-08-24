import { load } from "cheerio";
import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/meta-robots-conflict flags pages whose robots directives CONTRADICT each
 * other across the three places they can be declared: `<meta name="robots">`
 * tags, `<meta name="googlebot">` tags, and the `X-Robots-Tag` HTTP header.
 *
 * When directives conflict, Google applies the MOST RESTRICTIVE one
 * (https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag),
 * so an accidental `noindex` (e.g. left over from staging in a header while the
 * meta tag says `index`) silently wins and deindexes the page.
 *
 *   - error: a directive and its opposite both appear (index vs noindex,
 *            follow vs nofollow) anywhere across the sources.
 *
 * Deliberately NOT flagged: several robots meta tags carrying DIFFERENT content
 * strings. That is a documented, deterministic pattern, not an ambiguity: the
 * same doc shows
 *
 *     <meta name="robots" content="noindex">
 *     <meta name="robots" content="nofollow">
 *
 * as a supported way to write `noindex, nofollow`, and states that where
 * multiple rules are specified "the search engine will use the sum of the
 * negative rules". Split directives (`index, follow` in one tag,
 * `max-snippet:-1, max-image-preview:large` in another) are likewise fine. A
 * genuine contradiction between two such tags is already caught by the error
 * check above, which spans every source.
 *
 * Note: page.robotsMeta only holds the FIRST robots meta tag, so this rule
 * re-parses page.html to see every tag. It parses with cheerio rather than
 * regexes over the raw HTML: a commented-out staging directive
 * (`<!-- <meta name="robots" content="noindex"> -->`) is a comment node, not a
 * live declaration, and must never be read as one.
 */

interface RobotsDeclaration {
  /** Human-readable source label, e.g. `meta robots` or `X-Robots-Tag header`. */
  source: string;
  /** Lowercased, trimmed directive tokens. */
  directives: string[];
}

/**
 * Directive keywords that legitimately carry a `:value` suffix. A colon after
 * one of these is part of the directive, not a user-agent prefix.
 */
const VALUE_DIRECTIVES = new Set([
  "max-snippet",
  "max-image-preview",
  "max-video-preview",
  "unavailable_after",
]);

/** Normalize a robots content string into lowercase, trimmed directive tokens. */
export function normalizeDirectives(content: string): string[] {
  return content
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
}

/**
 * Split an `X-Robots-Tag` header value into per-user-agent directive groups.
 *
 * Google: "The X-Robots-Tag may optionally specify a user agent before the
 * rules", e.g. `X-Robots-Tag: googlebot: nofollow`. Several header lines are
 * folded into one comma-joined value by the HTTP stack, so a user-agent prefix
 * can appear mid-string and governs every token after it until the next prefix.
 * Without this split the token reads as the literal directive
 * `"googlebot: noindex"`, which matches nothing.
 */
export function parseXRobotsTag(value: string): Array<{ userAgent: string; directives: string[] }> {
  const groups: Array<{ userAgent: string; directives: string[] }> = [];
  let current = { userAgent: "", directives: [] as string[] };
  groups.push(current);

  for (const rawToken of value.split(",")) {
    const token = rawToken.trim();
    if (!token) continue;
    const colon = token.indexOf(":");
    if (colon > 0) {
      const key = token.slice(0, colon).trim().toLowerCase();
      if (!VALUE_DIRECTIVES.has(key)) {
        current = { userAgent: key, directives: [] };
        groups.push(current);
        const rest = token.slice(colon + 1).trim().toLowerCase();
        if (rest) current.directives.push(rest);
        continue;
      }
    }
    current.directives.push(token.toLowerCase());
  }

  return groups.filter((g) => g.directives.length > 0);
}

/**
 * True when a user-agent prefix governs Googlebot. An unprefixed group and `*`
 * apply to everyone; every Google crawler token contains "google"
 * (googlebot, googlebot-news, storebot-google, adsbot-google, …). Rules
 * addressed to another engine are none of this rule's business, and flagging
 * them would invent conflicts that do not exist for Google.
 */
export function xRobotsAppliesToGoogle(userAgent: string): boolean {
  return userAgent === "" || userAgent === "*" || userAgent.includes("google");
}

/** Extract every robots/googlebot meta declaration plus the X-Robots-Tag header. */
export function gatherRobotsDeclarations(page: ParsedPage): RobotsDeclaration[] {
  const declarations: RobotsDeclaration[] = [];

  if (page.html) {
    const $ = load(page.html);
    for (const el of $("meta").toArray()) {
      // Metadata names are ASCII case-insensitive, so fold before comparing.
      const name = (el.attribs?.name ?? "").trim().toLowerCase();
      if (name !== "robots" && name !== "googlebot") continue;
      const content = el.attribs?.content ?? "";
      declarations.push({ source: `meta ${name}`, directives: normalizeDirectives(content) });
    }
  }

  const xRobots = page.httpMeta?.xRobotsTag ?? "";
  if (xRobots.trim()) {
    for (const group of parseXRobotsTag(xRobots)) {
      if (!xRobotsAppliesToGoogle(group.userAgent)) continue;
      declarations.push({
        source: group.userAgent
          ? `X-Robots-Tag header (${group.userAgent})`
          : "X-Robots-Tag header",
        directives: group.directives,
      });
    }
  }

  return declarations.filter((d) => d.directives.length > 0);
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
      for (const directive of decl.directives) {
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
  }

  return findings;
}
