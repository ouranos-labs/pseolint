import type { ParsedPage, RuleResult } from "../../types.js";
import { extractKeywords } from "../../algorithms/tf-idf.js";

const MIN_SECTION_PAGES = 10;
const ESCALATE_TO_ERROR_AT = 50;
const TOPIC_TOP_N = 100;
const SAMPLE_URLS = 20;

const TRIP = {
  inboundExternalRatio: 0.20,
  topicJaccardDistance: 0.75,
  templateOverlap: 0.10,
  authorshipDelta: 0.40,
  authorshipLowMax: 0.30,
  authorshipHighMin: 0.70,
} as const;

interface SectionStats {
  prefix: string;
  pages: ParsedPage[];
}

function sectionPrefixFor(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const trimmed = pathname.replace(/^\/+/, "");
  if (trimmed.length === 0) return null;
  const first = trimmed.split("/")[0];
  if (!first) return null;
  return `/${first}/`;
}

function authorCoverage(pages: ParsedPage[]): number {
  if (pages.length === 0) return 0;
  let withAuthor = 0;
  for (const page of pages) {
    const a = page.authorSignals;
    if (a.metaAuthor || a.schemaAuthor || a.bylineElement || a.relAuthorLink) {
      withAuthor += 1;
    }
  }
  return withAuthor / pages.length;
}

function jaccardDistance(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const term of a) {
    if (b.has(term)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return 1 - intersection / union;
}

export function hostSectionDivergenceRule(
  pages: ParsedPage[],
  adjacency: Map<string, Set<string>>,
): RuleResult[] {
  if (pages.length < MIN_SECTION_PAGES * 2) return [];

  const sections = new Map<string, ParsedPage[]>();
  for (const page of pages) {
    const prefix = sectionPrefixFor(page.url);
    if (!prefix) continue;
    const group = sections.get(prefix) ?? [];
    group.push(page);
    sections.set(prefix, group);
  }

  // Candidates: sections that meet the size floor, leave a "rest of host" pool
  // that's also at least as large as MIN_SECTION_PAGES, AND are a strict
  // minority of the corpus (< 50%). The minority gate is what keeps the rule
  // from emitting symmetric findings on both halves of a binary section split:
  // reputation abuse is, by definition, a small parasite section riding a
  // larger host. A 50/50 split is a multi-topic site, not abuse.
  const halfCorpus = pages.length / 2;
  const candidates: SectionStats[] = [];
  for (const [prefix, sectionPages] of sections.entries()) {
    if (sectionPages.length < MIN_SECTION_PAGES) continue;
    if (pages.length - sectionPages.length < MIN_SECTION_PAGES) continue;
    if (sectionPages.length >= halfCorpus) continue;
    candidates.push({ prefix, pages: sectionPages });
  }
  if (candidates.length === 0) return [];

  const allTexts = pages.map((p) => p.contentText);
  const findings: RuleResult[] = [];

  for (const { prefix, pages: sectionPages } of candidates) {
    const sectionUrls = new Set(sectionPages.map((p) => p.url));
    const restPages = pages.filter((p) => !sectionUrls.has(p.url));

    // 1. inboundExternalRatio: pages in section with ≥1 inbound link from outside the section.
    let pagesWithExternalInbound = 0;
    for (const page of sectionPages) {
      let hasExternal = false;
      for (const [sourceUrl, targets] of adjacency.entries()) {
        if (sectionUrls.has(sourceUrl)) continue;
        if (targets.has(page.url)) {
          hasExternal = true;
          break;
        }
      }
      if (hasExternal) pagesWithExternalInbound += 1;
    }
    const inboundExternalRatio = pagesWithExternalInbound / sectionPages.length;

    // 2. topicJaccardDistance: top-N TF-IDF terms per pool.
    const sectionText = sectionPages.map((p) => p.contentText).join("\n");
    const restText = restPages.map((p) => p.contentText).join("\n");
    const sectionTerms = new Set(extractKeywords(sectionText, allTexts, TOPIC_TOP_N));
    const restTerms = new Set(extractKeywords(restText, allTexts, TOPIC_TOP_N));
    const topicJaccardDistance = jaccardDistance(sectionTerms, restTerms);

    // 3. templateOverlap: section structureSignatures that also appear in rest.
    const restSignatures = new Set(restPages.map((p) => p.structureSignature));
    let sectionPagesWithRestSignature = 0;
    for (const page of sectionPages) {
      if (restSignatures.has(page.structureSignature)) sectionPagesWithRestSignature += 1;
    }
    const templateOverlap = sectionPagesWithRestSignature / sectionPages.length;

    // 4. authorshipMismatch: gap between section and rest author coverage.
    const sectionAuthorCoverage = authorCoverage(sectionPages);
    const restAuthorCoverage = authorCoverage(restPages);
    const authorshipDelta = Math.abs(sectionAuthorCoverage - restAuthorCoverage);
    const authorshipMismatch =
      authorshipDelta >= TRIP.authorshipDelta &&
      ((sectionAuthorCoverage <= TRIP.authorshipLowMax && restAuthorCoverage >= TRIP.authorshipHighMin) ||
        (restAuthorCoverage <= TRIP.authorshipLowMax && sectionAuthorCoverage >= TRIP.authorshipHighMin));

    const tripped: string[] = [];
    if (inboundExternalRatio < TRIP.inboundExternalRatio) {
      tripped.push(`inboundExternalRatio=${inboundExternalRatio.toFixed(2)}`);
    }
    if (topicJaccardDistance > TRIP.topicJaccardDistance) {
      tripped.push(`topicJaccardDistance=${topicJaccardDistance.toFixed(2)}`);
    }
    if (templateOverlap < TRIP.templateOverlap) {
      tripped.push(`templateOverlap=${templateOverlap.toFixed(2)}`);
    }
    if (authorshipMismatch) {
      tripped.push(
        `authorshipMismatch (section=${sectionAuthorCoverage.toFixed(2)}, rest=${restAuthorCoverage.toFixed(2)})`,
      );
    }

    if (tripped.length < 2) continue;

    const escalate = tripped.length >= 3 && sectionPages.length > ESCALATE_TO_ERROR_AT;
    const severity = escalate ? "error" : "warning";

    findings.push({
      ruleId: "links/host-section-divergence",
      severity,
      message:
        `Section ${prefix} (${sectionPages.length} pages) diverges from the rest of the host on ` +
        `${tripped.length} signals: ${tripped.join(", ")}.`,
      fix:
        "Either (a) integrate this section editorially with the rest of the host (cross-link from primary navigation, " +
        "share authorship/schema, align template) or (b) move it to a subdomain so it builds reputation on its own. " +
        "Google's May 2024 site-reputation-abuse policy targets sections that ride a host's reputation without integrating into it.",
      relatedUrls: sectionPages.slice(0, SAMPLE_URLS).map((p) => p.url),
    });
  }

  return findings;
}
