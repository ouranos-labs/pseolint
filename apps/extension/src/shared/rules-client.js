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

// (rawHtml, url, httpStatus) → verdict | null. Runs the real core rules over a
// parsed-signal subset, then gates to high-confidence.
export function verdictFor(html, url, status) {
  const page = parseSignals(html, url, status);
  if (page.isLikelyShell) return null; // un-rendered SPA — can't judge, don't guess
  const findings = [
    ...ogCompletenessRule([page]),
    ...soft404Rule([page]),
    ...thinContentRule([page], THIN_MIN_WORDS).findings,
  ];
  return toVerdict(findings);
}
