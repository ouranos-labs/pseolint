import { load } from "cheerio";
import { maskEntities } from "./entity-mask.js";
import type { EntityMaskPattern, ParsedPage } from "../types.js";

export type FactKind =
  | "money" | "percent" | "timeframe" | "date" | "isoDate" | "form"
  | "ratio" | "measurement";

export interface FactSpan {
  value: string;
  kind: FactKind;
}

export interface NamedEntity {
  value: string;
  source: "proper-noun" | "cue-word" | "json-ld";
  type?: "organization" | "person" | "product" | "law" | "standard" | "place" | "other";
}

export interface Citation {
  href: string;
  domain: string;
  authority: "authoritative" | "general";
  reason?: "tld" | "allowlist";
}

export interface GroundedClaim {
  sentence: string;
  facts: string[];
  citations: string[];
}

export interface PageFacts {
  /** EXACTLY today's extractRawFacts() output (run on entity-masked text). Frozen. */
  citableFacts: string[];
  measurements: FactSpan[];
  namedEntities: NamedEntity[];
  citations: Citation[];
  groundedClaims: GroundedClaim[];
}

// --- Numeric "citable" facts: the frozen subset aeo/citable-facts counts. ---
// These six patterns are lifted verbatim from rules/aeo/citable-facts.ts and
// MUST stay byte-identical to preserve the calibration corpus.
const CITABLE_FACT_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "dollar", regex: /\$[\d,]+(\.\d{2})?/g },
  { name: "percent", regex: /\b\d+(\.\d+)?\s*%/g },
  {
    name: "timeframe",
    regex: /\b\d+(?:-\d+)?\s*(business\s+days?|days?|weeks?|months?|years?|hours?|minutes?)\b/gi,
  },
  {
    name: "date",
    regex:
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
  },
  { name: "isoDate", regex: /\b\d{4}-\d{2}-\d{2}\b/g },
  { name: "form", regex: /\bForm\s+[A-Z0-9][A-Z0-9-]*\b/g },
];

export function extractCitableFacts(text: string): string[] {
  const out = new Set<string>();
  for (const { regex } of CITABLE_FACT_PATTERNS) {
    const matches = text.match(regex);
    if (!matches) continue;
    for (const m of matches) out.add(m.trim().toLowerCase());
  }
  return Array.from(out);
}

// --- Measurements: NEW numeric kinds, deliberately separate from citableFacts. ---
const MEASUREMENT_UNITS =
  "kg|g|lb|lbs|oz|mi|km|cm|mm|ft|in|MB|GB|TB|KB|ms|fps|mph|kWh";
const MEASUREMENT_PATTERNS: Array<{ kind: FactKind; regex: RegExp }> = [
  { kind: "ratio", regex: /\b\d+(?:\.\d+)?\s*(?:out of|in)\s*\d+\b/gi },
  { kind: "ratio", regex: /\b\d+\s*:\s*\d+\b/g },
  { kind: "measurement", regex: new RegExp(`\\b\\d+(?:\\.\\d+)?\\s*(?:${MEASUREMENT_UNITS})\\b`, "g") },
];

export function extractMeasurements(maskedText: string): FactSpan[] {
  const seen = new Set<string>();
  const out: FactSpan[] = [];
  for (const { kind, regex } of MEASUREMENT_PATTERNS) {
    const matches = maskedText.match(regex);
    if (!matches) continue;
    for (const m of matches) {
      const value = m.replace(/\s+/g, " ").trim().toLowerCase();
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ value, kind });
    }
  }
  return out;
}

const MULTI_WORD_PROPER_NOUN = /\b[A-Z][a-z]+(?:\s+(?:of\s+|de\s+|and\s+|the\s+)?[A-Z][a-z]+)+\b/g;
const ACRONYM = /\b(?:ISO|GDPR|HIPAA|FDA|SEC|FTC|EPA|W3C|IETF|RFC|NIST|OSHA|IRS|EU|UN|WHO|CCPA|PCI)\b/g;
const CUE_WORD = /\b(?:Inc|LLC|Ltd|Corp|GmbH|Act|Regulation|Directive|Agency|Department|Bureau|Commission|Authority|University|Institute|Association|Standard|Protocol)\b/;

const JSON_LD_ENTITY_TYPES = new Set([
  "Organization", "GovernmentOrganization", "Corporation", "NGO",
  "Person", "Product", "Brand",
]);

function jsonLdEntities(nodes: unknown[]): NamedEntity[] {
  const out: NamedEntity[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    const name = obj["name"];
    if (typeof name === "string" && typeof type === "string" && JSON_LD_ENTITY_TYPES.has(type)) {
      out.push({ value: name.trim().toLowerCase(), source: "json-ld", type: "organization" });
    }
    for (const v of Object.values(obj)) visit(v);
  };
  nodes.forEach(visit);
  return out;
}

export function extractNamedEntities(maskedText: string, jsonLd: unknown[] = []): NamedEntity[] {
  const seen = new Set<string>();
  const out: NamedEntity[] = [];
  const push = (value: string, source: NamedEntity["source"]): void => {
    const v = value.replace(/\s+/g, " ").trim().toLowerCase();
    if (v.length < 2 || seen.has(v)) return;
    seen.add(v);
    out.push({ value: v, source });
  };
  for (const m of jsonLdEntities(jsonLd)) push(m.value, "json-ld");
  for (const m of maskedText.match(ACRONYM) ?? []) push(m, "cue-word");
  for (const m of maskedText.match(MULTI_WORD_PROPER_NOUN) ?? []) {
    push(m, CUE_WORD.test(m) ? "cue-word" : "proper-noun");
  }
  return out;
}

export const DEFAULT_CITATION_ALLOWLIST: readonly string[] = [
  "wikipedia.org", "w3.org", "iso.org", "ietf.org", "rfc-editor.org",
  "doi.org", "nih.gov", "ncbi.nlm.nih.gov", "who.int", "schema.org",
  "oecd.org", "worldbank.org", "europa.eu",
  // Google's own published documentation is the primary authoritative source for
  // claims about Google's ranking and spam systems (Search Essentials, spam
  // policies, helpful-content guidance) and for Core Web Vitals (web.dev).
  // Scoped to the docs subdomain: a bare google.com link (Maps, search results)
  // is deliberately NOT credited as authoritative.
  "developers.google.com", "web.dev",
];

const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "ac.uk", "gov.uk", "org.uk", "com.au", "gov.au", "edu.au",
  "co.jp", "co.nz", "co.za", "com.br",
]);

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

export function registrableDomain(host: string): string {
  const labels = host.replace(/^www\./, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

function isAuthoritativeTld(host: string): boolean {
  return /\.(?:gov|edu|mil|int)$/.test(host) || /\.(?:gov|edu|ac)\.[a-z]{2}$/.test(host);
}

export function classifyCitations(
  resolvedHrefs: readonly string[],
  pageUrl: string,
  allowlist: readonly string[] = DEFAULT_CITATION_ALLOWLIST,
): Citation[] {
  const pageHost = hostOf(pageUrl);
  const pageDomain = pageHost ? registrableDomain(pageHost) : null;
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const href of resolvedHrefs) {
    const host = hostOf(href);
    if (!host) continue;
    const domain = registrableDomain(host);
    if (pageDomain && domain === pageDomain) continue; // internal link
    if (seen.has(href)) continue;
    seen.add(href);
    if (isAuthoritativeTld(host)) {
      out.push({ href, domain, authority: "authoritative", reason: "tld" });
    } else if (allowlist.some((d) => host === d || host.endsWith(`.${d}`))) {
      out.push({ href, domain, authority: "authoritative", reason: "allowlist" });
    } else {
      out.push({ href, domain, authority: "general" });
    }
  }
  return out;
}

export function hasAuthoritativeCitation(
  resolvedHrefs: readonly string[],
  pageUrl: string,
  allowlist: readonly string[] = DEFAULT_CITATION_ALLOWLIST,
): boolean {
  return classifyCitations(resolvedHrefs, pageUrl, allowlist).some((c) => c.authority === "authoritative");
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9"'(])/;

function resolveHrefs(hrefs: string[], base: string): string[] {
  const out: string[] = [];
  for (const h of hrefs) {
    try { out.push(new URL(h, base).href); } catch { /* skip unparseable */ }
  }
  return out;
}

/**
 * Deterministic approximation of "a verifiable claim": a block (<p>/<li>) that
 * contains a statistic AND an outbound citation. Approximated at block level,
 * not exact sentence level: documented limitation. Detects co-occurrence, not
 * semantic truth. Consume at `speculative` confidence.
 */
export function extractGroundedClaims(
  html: string,
  pageUrl: string,
  allowlist: readonly string[] = DEFAULT_CITATION_ALLOWLIST,
): GroundedClaim[] {
  const $ = load(html);
  $("nav, header, footer, aside, script, style, noscript").remove();
  const claims: GroundedClaim[] = [];
  const scope = $("article").length > 0 ? $("article") : $("main").length > 0 ? $("main") : $("body");
  scope.find("p, li").each((_i, el) => {
    const $el = $(el);
    const rawLinks = $el.find("a[href]").map((_j, a) => String($(a).attr("href") ?? "")).get();
    const citations = classifyCitations(resolveHrefs(rawLinks, pageUrl), pageUrl, allowlist);
    if (citations.length === 0) return;
    const text = $el.text().replace(/\s+/g, " ").trim();
    for (const sentence of text.split(SENTENCE_SPLIT)) {
      const facts = [
        ...extractCitableFacts(sentence),
        ...extractMeasurements(sentence).map((m) => m.value),
      ];
      if (facts.length === 0) continue;
      claims.push({
        sentence: sentence.trim().slice(0, 240),
        facts,
        citations: citations.map((c) => c.href),
      });
      break; // one grounded claim per block is enough; avoids over-counting
    }
  });
  return claims;
}

export function extractPageFacts(
  page: Pick<ParsedPage, "url" | "contentText" | "html" | "resolvedHrefs" | "jsonLd">,
  entityPatterns: EntityMaskPattern[],
  allowlist: readonly string[] = DEFAULT_CITATION_ALLOWLIST,
): PageFacts {
  const masked = maskEntities(page.contentText, entityPatterns);
  return {
    citableFacts: extractCitableFacts(masked),
    measurements: extractMeasurements(masked),
    namedEntities: extractNamedEntities(masked, page.jsonLd),
    citations: classifyCitations(page.resolvedHrefs, page.url, allowlist),
    groundedClaims: extractGroundedClaims(page.html, page.url, allowlist),
  };
}
