import type { Confidence, ParsedPage, RuleResult } from "../../types.js";

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function thinContentRule(
  pages: ParsedPage[],
  minWords: number
): { findings: RuleResult[]; thinContentUrls: Set<string> } {
  const findings: RuleResult[] = [];
  const thinContentUrls = new Set<string>();

  for (const page of pages) {
    const words = countWords(page.contentText);
    if (words >= minWords) {
      continue;
    }

    thinContentUrls.add(page.url);
    // Confidence ladder:
    //   far below threshold (<50%) → high (clearly under-built)
    //   just under threshold        → medium (could legitimately be a short page)
    const confidence: Confidence = words < minWords / 2 ? "high" : "medium";
    const shortPageNote =
      confidence === "medium"
        ? " Some pages (landing pages, contact, status, tools) are legitimately short; verify whether this URL is meant to host substantive content."
        : "";

    findings.push({
      ruleId: "spam/thin-content",
      // High confidence (far below the floor) is an error; the medium band: which
      // the rule itself flags as "could legitimately be a short page"; is a
      // warning, not a ship-blocker. The page still joins thinContentUrls either
      // way so spam/doorway-pattern can stack on it.
      severity: confidence === "high" ? "error" : "warning",
      confidence,
      message: `${page.url} has thin content (${words} words).${shortPageNote}`,
      fix: `Add at least ${minWords - words} more words of substantive content relevant to this page's specific topic.`
    });
  }

  return { findings, thinContentUrls };
}
