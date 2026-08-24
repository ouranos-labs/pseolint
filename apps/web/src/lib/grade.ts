/**
 * Canonical risk-band vocabulary, aligned with the engine's verdict ladder
 * (ready / caution / concerning / critical, defined in `auditor.ts`
 * `verdictForRisk`). One definition of "what does this risk score mean"
 * across every dashboard surface: leaderboard cards, portfolio cards,
 * per-host hero, sparkline tone, trend-chart fill, and marketing copy.
 *
 * v0.5.3: band labels are now verdict-aligned (B reads "caution" instead
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
  if (risk < 21) return { letter: "A", band: "ready · 0–20", bg: "bg-success/15", text: "text-success", dot: "bg-success" };
  // B reads "caution" (not "good"): its risk range matches verdictForRisk's
  // caution tier. Tone shifts to muted/warning so the chip stops looking like
  // a thumbs-up next to a caution verdict.
  if (risk < 41) return { letter: "B", band: "caution · 21–40", bg: "bg-warning/10", text: "text-warning", dot: "bg-warning" };
  if (risk < 61) return { letter: "C", band: "concerning · 41–60", bg: "bg-warning/15", text: "text-warning", dot: "bg-warning" };
  // D + F both map to engine verdict "critical"; keep separate letters but
  // use the same vocabulary so the chip text matches the verdict.
  if (risk < 81) return { letter: "D", band: "critical · 61–80", bg: "bg-warning/25", text: "text-warning", dot: "bg-warning" };
  return { letter: "F", band: "critical · 80+", bg: "bg-destructive/15", text: "text-destructive", dot: "bg-destructive" };
}

/** Just the text-tone class: convenience for callers that only need to color a number. */
export function scoreTone(risk: number | null): string {
  return gradeOf(risk).text;
}

/**
 * The engine's moderated user-facing verdict ladder. Mirrors the core
 * `Verdict` type (`ready | caution | concerning | critical`). Authority +
 * content-effort moderation only move the verdict, never the raw `risk`: so
 * the verdict is the ONLY honest headline signal. The raw `risk` is internal
 * and "NEVER displayed to humans" (see core `AuditSummary`), so dashboard
 * surfaces must read the persisted verdict rather than re-deriving a tier from
 * the unmoderated risk via `gradeOf`.
 *
 * Tones mirror the public report hero (`/r/[slug]` `verdictTone`) so the
 * moderated headline reads identically everywhere. `null` covers legacy rows
 * that predate the persisted `verdict` / `lastVerdict` columns.
 */
export type Verdict = "ready" | "caution" | "concerning" | "critical";

export interface VerdictStyle {
  label: string;
  /** Tailwind text-tone utility. */
  tone: string;
  /** Tailwind background utility for dot indicators (no opacity). */
  dot: string;
  /** Tailwind border utility for chip/card outlines. */
  border: string;
  /** Tailwind background utility for chip/card fills. */
  bg: string;
}

export function verdictStyle(verdict: Verdict | null): VerdictStyle {
  switch (verdict) {
    case "ready":
      return { label: "Ready", tone: "text-success", dot: "bg-success", border: "border-success/30", bg: "bg-success/5" };
    case "caution":
      return { label: "Caution", tone: "text-warning", dot: "bg-warning", border: "border-warning/30", bg: "bg-warning/5" };
    case "concerning":
      // No orange token in this design system; saturate warning for
      // "concerning" and reserve destructive for "critical".
      return { label: "Concerning", tone: "text-warning", dot: "bg-warning", border: "border-warning/50", bg: "bg-warning/10" };
    case "critical":
      return { label: "Critical", tone: "text-destructive", dot: "bg-destructive", border: "border-destructive/40", bg: "bg-destructive/5" };
    default:
      // Legacy rows with no persisted verdict.
      return { label: "No verdict yet", tone: "text-muted-foreground", dot: "bg-muted-foreground", border: "border-border/60", bg: "bg-muted/20" };
  }
}
