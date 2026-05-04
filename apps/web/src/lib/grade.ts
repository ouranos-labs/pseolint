/**
 * Canonical risk-band vocabulary, aligned with the engine's verdict ladder
 * (ready / caution / concerning / critical, defined in `auditor.ts`
 * `verdictForRisk`). One definition of "what does this risk score mean"
 * across every dashboard surface — leaderboard cards, portfolio cards,
 * per-host hero, sparkline tone, trend-chart fill, and marketing copy.
 *
 * v0.5.3 — band labels are now verdict-aligned (B reads "caution" instead
 * of "good", D reads "critical" instead of "severe") so a B-grade summary
 * doesn't visually undercut a caution verdict. This was the bestfirenze.com
 * mismatch: risk 37 surfaced as "B (good)" while the engine emitted
 * `verdict: caution`.
 *
 * Lower-is-safer model: a 32 is grade B (caution), a 75 is grade D (critical).
 */

export interface Grade {
  letter: "A" | "B" | "C" | "D" | "F" | "—";
  band: string;
  /** Tailwind background utility for chip backgrounds. */
  bg: string;
  /** Tailwind text utility for letter + numeric score. */
  text: string;
  /** Tailwind background utility for dot indicators (no opacity). */
  dot: string;
}

export function gradeOf(risk: number | null): Grade {
  if (risk == null) {
    return { letter: "—", band: "no score yet", bg: "bg-muted/40", text: "text-muted-foreground", dot: "bg-muted-foreground" };
  }
  if (risk < 20) return { letter: "A", band: "ready · 0–19", bg: "bg-success/15", text: "text-success", dot: "bg-success" };
  // B reads "caution" (not "good") — its risk range matches verdictForRisk's
  // caution tier. Tone shifts to muted/warning so the chip stops looking like
  // a thumbs-up next to a caution verdict.
  if (risk < 40) return { letter: "B", band: "caution · 20–39", bg: "bg-warning/10", text: "text-warning", dot: "bg-warning" };
  if (risk < 60) return { letter: "C", band: "concerning · 40–59", bg: "bg-warning/15", text: "text-warning", dot: "bg-warning" };
  // D + F both map to engine verdict "critical"; keep separate letters but
  // use the same vocabulary so the chip text matches the verdict.
  if (risk < 80) return { letter: "D", band: "critical · 60–79", bg: "bg-warning/25", text: "text-warning", dot: "bg-warning" };
  return { letter: "F", band: "critical · 80+", bg: "bg-destructive/15", text: "text-destructive", dot: "bg-destructive" };
}

/** Just the text-tone class — convenience for callers that only need to color a number. */
export function scoreTone(risk: number | null): string {
  return gradeOf(risk).text;
}
