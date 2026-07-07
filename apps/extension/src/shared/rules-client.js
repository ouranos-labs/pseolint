// pseolint extension — the Tier-1 client rule subset (architecture §6).
//
// One implementation, never forked: the rule LOGIC is imported straight from
// @pseolint/core via its curated subpath exports. Those three export lines in
// core/package.json ARE the documented Tier-1 boundary — a rule graduates to
// client-sound by getting an export, nothing more. Each module imports only
// `import type` from core, so the built JS is dependency-free (§6 spike: ~478B).
import { ogCompletenessRule } from "@pseolint/core/rules/tech/og-completeness";
import { soft404Rule } from "@pseolint/core/rules/tech/soft-404";
import { thinContentRule } from "@pseolint/core/rules/spam/thin-content";
import { parseSignals } from "./parse.js";

// Mirror core's DEFAULTS.thinContentMinWords (auditor.ts). thin-content marks a
// finding `high` confidence only when words < minWords/2 — that <150-word band is
// the only thin-content we badge, so regex word-count slack (parse.js) is moot.
const THIN_MIN_WORDS = 300;

const TAG = {
  "tech/og-completeness": "no OG tags",
  "tech/soft-404": "soft 404",
  "spam/thin-content": "thin",
  "eeat/missing-author": "no Author",
  "eeat/missing-date": "no Date",
  "opp/title-rewritten": "title rewritten",
  "opp/no-meta-desc": "no meta desc",
};

// findings → { level, label } for overlay.badgeView, or null = do not badge.
// fail-closed by design (§9): we surface ONLY high-confidence findings. A wrong
// badge on a SERP of sites the practitioner built themselves is credibility death.
export function toVerdict(findings) {
  const sure = findings.filter((f) => (f.confidence ?? "high") === "high");
  if (sure.length === 0) return null;
  const blocking = sure.some((f) => f.severity === "error" || f.severity === "critical");
  const label = sure.length === 1 ? (TAG[sure[0].ruleId] ?? "flagged") : `${sure.length} flags`;
  return { level: blocking ? "flag" : "warn", label };
}

// Full per-page signal set for the SERP scorecard: word count, OG completeness,
// shell flag, the high-confidence finding tags (`flags`), and the overall verdict.
// Runs the real core rules over the parsed-signal subset (§6, one implementation).
export function scanPage(html, url, status) {
  const page = parseSignals(html, url, status);
  const words = page.contentText ? page.contentText.split(/\s+/).filter(Boolean).length : 0;
  const ogComplete = !!(page.og.title && page.og.description && page.og.image);
  if (page.isLikelyShell) {
    return {
      words,
      ogComplete,
      isLikelyShell: true,
      flags: [],
      verdict: null,
      aeoReady: false,
      structureSignature: page.structureSignature,
      liveTitle: page.title,
      liveDescription: page.metaDescription,
      liveDate: page.publishedDate,
      hasSchema: page.hasSchema,
    };
  }
  // AEO-readiness proxy (browser-safe; the authoritative aeo/* audit is the SaaS):
  // structured data present + either FAQ structure or a fact-led opening.
  const faq = page.headings.h2.some((h) => h.includes("?"));
  const opener = page.contentText.split(/\s+/).slice(0, 60).join(" ");
  const factLed = /(\$[\d,]+|\d+(?:\.\d+)?\s*%|\b(?:19|20)\d{2}\b|\b\d+\s*(?:days?|weeks?|months?|years?|hours?|minutes?)\b)/i.test(opener);
  const aeoReady = page.hasSchema && (faq || factLed);
  const findings = [
    ...ogCompletenessRule([page]),
    ...soft404Rule([page]),
    ...thinContentRule([page], THIN_MIN_WORDS).findings,
  ];

  const hasAuthor = !!(page.authorSignals?.metaAuthor || page.authorSignals?.schemaAuthor);
  const hasDate = !!page.publishedDate;
  if (!hasAuthor) {
    findings.push({ ruleId: "eeat/missing-author", severity: "warning", confidence: "high" });
  }
  if (!hasDate) {
    findings.push({ ruleId: "eeat/missing-date", severity: "warning", confidence: "high" });
  }

  const flags = findings
    .filter((f) => (f.confidence ?? "high") === "high")
    .map((f) => TAG[f.ruleId] ?? "flagged");

  const metaDescription = page.metaDescription || page.og.description;

  return {
    words,
    ogComplete,
    isLikelyShell: false,
    flags,
    verdict: toVerdict(findings),
    aeoReady,
    structureSignature: page.structureSignature,
    liveTitle: page.title,
    liveDescription: metaDescription,
    liveDate: page.publishedDate,
    hasSchema: page.hasSchema,
  };
}

// (rawHtml, url, httpStatus) → verdict | null. Back-compat thin wrapper.
export function verdictFor(html, url, status) {
  return scanPage(html, url, status).verdict;
}
