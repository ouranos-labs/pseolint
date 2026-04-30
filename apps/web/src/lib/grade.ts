/**
 * Canonical risk-band vocabulary.
 *
 * One definition of "what does this risk score mean" across every dashboard
 * surface — leaderboard cards, portfolio cards, per-host hero, sparkline tone,
 * trend-chart fill, and marketing copy. Five bands at 20/40/60/80 cutoffs.
 *
 * Lower-is-safer model: a 32 is grade B (good), a 75 is grade D (severe).
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
  if (risk < 40) return { letter: "B", band: "good · 20–39", bg: "bg-success/10", text: "text-success", dot: "bg-success" };
  if (risk < 60) return { letter: "C", band: "concerning · 40–59", bg: "bg-warning/15", text: "text-warning", dot: "bg-warning" };
  if (risk < 80) return { letter: "D", band: "severe · 60–79", bg: "bg-warning/25", text: "text-warning", dot: "bg-warning" };
  return { letter: "F", band: "critical · 80+", bg: "bg-destructive/15", text: "text-destructive", dot: "bg-destructive" };
}

/** Just the text-tone class — convenience for callers that only need to color a number. */
export function scoreTone(risk: number | null): string {
  return gradeOf(risk).text;
}
