import type { RuleResult, Severity } from "../types.js";

/**
 * Programmatic-SEO archetype — the site's content strategy. Inferred by the
 * triage LLM (tier 1); centralized here as a first-class, reusable signal
 * (tier 2) so deterministic consumers — the intent verdict moderator (tier 3),
 * monitoring, the fix-budget planner — share one vocabulary and one mapping.
 */
export const ARCHETYPES = [
  "directory",
  "comparison",
  "location-pages",
  "glossary",
  "aggregator",
  "programmatic-blog",
  "other",
] as const;

export type Archetype = (typeof ARCHETYPES)[number];

/** Rule-id family = the prefix before the first slash (e.g. `spam/near-duplicate` → `spam`). */
export type RuleFamily =
  | "spam"
  | "content"
  | "aeo"
  | "tech"
  | "schema"
  | "data"
  | "links"
  | "cannibal";

const KNOWN_FAMILIES = new Set<RuleFamily>([
  "spam",
  "content",
  "aeo",
  "tech",
  "schema",
  "data",
  "links",
  "cannibal",
]);

/** Extract the rule family from a rule id. Returns null for unprefixed/unknown ids. */
export function ruleFamily(ruleId: string): RuleFamily | null {
  const prefix = ruleId.split("/", 1)[0];
  return KNOWN_FAMILIES.has(prefix as RuleFamily) ? (prefix as RuleFamily) : null;
}

export interface ArchetypeProfile {
  /** Families that carry the real penalty/visibility risk for this strategy. */
  primary: RuleFamily[];
  /** Families whose findings are expected background for this strategy (some is normal). */
  tolerant: RuleFamily[];
  /**
   * True when structural similarity across the URL cluster is inherent to the
   * strategy (many near-identical pages by design). For these, a spam-family
   * driver can be structural rather than spammy — the lever tier 3 acts on.
   */
  clusterTolerant: boolean;
}

/**
 * Deterministic per-archetype rule profile. Pure lookup — no LLM. This is the
 * shared primitive: tier 3 reads `clusterTolerant`, a planner can weight by
 * `primary`, and a UI can explain why a family is expected via `tolerant`.
 */
export function archetypeRuleProfile(archetype: Archetype): ArchetypeProfile {
  switch (archetype) {
    case "directory":
      return { primary: ["spam"], tolerant: ["content"], clusterTolerant: true };
    case "location-pages":
      return { primary: ["spam"], tolerant: ["content"], clusterTolerant: true };
    case "aggregator":
      return { primary: ["data", "spam"], tolerant: ["content"], clusterTolerant: true };
    case "comparison":
      return { primary: ["data", "content"], tolerant: [], clusterTolerant: false };
    case "glossary":
      return { primary: ["content", "aeo"], tolerant: [], clusterTolerant: false };
    case "programmatic-blog":
      return { primary: ["content", "aeo"], tolerant: [], clusterTolerant: false };
    case "other":
      return { primary: [], tolerant: [], clusterTolerant: false };
  }
}

/**
 * The rules that fire on structural (templated) similarity across a URL cluster
 * — the "same page shape, swapped entity" signal. On a cluster-tolerant
 * archetype these are inherent to the strategy, not necessarily spam; they are
 * the specific driver tier 3 acts on. (Content-family rules like
 * title-uniqueness co-fire heavily on such sites and dominate by count, which
 * is why tier 3 keys on THESE rules, not the top family.)
 */
const STRUCTURAL_SIMILARITY_RULES = new Set(["spam/near-duplicate", "spam/entity-swap"]);

const SEVERITY_WEIGHT: Record<Severity, number> = { info: 0, warning: 1, error: 2, critical: 3 };

/**
 * True when structural-similarity rules (near-duplicate / entity-swap) fired at
 * error+ severity — the "this cluster is templated-similar" signal. Deterministic.
 */
export function hasStructuralSimilarityDriver(findings: readonly RuleResult[]): boolean {
  return findings.some(
    (f) => STRUCTURAL_SIMILARITY_RULES.has(f.ruleId) && (f.severity === "error" || f.severity === "critical"),
  );
}

/**
 * The rule family driving the most severity-weighted findings — the "what's
 * mostly wrong here" signal. Deterministic. Returns null when there are no
 * family-attributable findings. Ties break by the order families first appear.
 */
export function topDriverFamily(findings: readonly RuleResult[]): RuleFamily | null {
  const weight = new Map<RuleFamily, number>();
  const firstSeen = new Map<RuleFamily, number>();
  findings.forEach((f, i) => {
    const fam = ruleFamily(f.ruleId);
    if (!fam) return;
    weight.set(fam, (weight.get(fam) ?? 0) + (SEVERITY_WEIGHT[f.severity] ?? 0) + 1); // +1 so info-only still counts
    if (!firstSeen.has(fam)) firstSeen.set(fam, i);
  });
  let best: RuleFamily | null = null;
  let bestW = -1;
  for (const [fam, w] of weight) {
    if (w > bestW || (w === bestW && best !== null && firstSeen.get(fam)! < firstSeen.get(best)!)) {
      best = fam;
      bestW = w;
    }
  }
  return best;
}
