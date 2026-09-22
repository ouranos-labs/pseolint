import type { Verdict } from "../src/types.js";
import { VERDICT_RANK } from "./corpus-types.js";

/** Minimal result shape the floor gate needs (fake payloads + calibration results). */
export interface GateFloorSite {
  url: string;
  gateFloor?: boolean;
  expectedVerdictFloor?: Verdict;
  audit: { verdict: Verdict } | null;
  error?: string;
}

/**
 * Hard CI gate for policy-violating sites stamped with `gateFloor: true`.
 * Omitted/`false` → no-op (report/ratchet only). Throws when actual verdict
 * ranks below `expectedVerdictFloor`.
 */
export function assertGateFloor(site: GateFloorSite): void {
  if (!site.gateFloor) return;
  if (site.error) {
    throw new Error(
      `${site.url}: gateFloor site errored during audit (${site.error}); cannot assert floor`,
    );
  }
  if (!site.audit) {
    throw new Error(`${site.url}: gateFloor site has no audit result; cannot assert floor`);
  }
  const floor = site.expectedVerdictFloor;
  if (!floor) {
    throw new Error(
      `${site.url}: gateFloor is true but expectedVerdictFloor is missing`,
    );
  }
  const actual = site.audit.verdict;
  const actualRank = VERDICT_RANK[actual];
  const floorRank = VERDICT_RANK[floor];
  if (actualRank < floorRank) {
    throw new Error(
      `${site.url}: verdict '${actual}' is below expectedVerdictFloor '${floor}' ` +
        `(gateFloor CI). Engine recall regressed on a site that previously met its floor.`,
    );
  }
}
