// Shared severity → Tailwind class mappings for dashboard finding displays.
// Three call sites had identical copies of these helpers; consolidating here
// keeps colour semantics consistent across the dashboard.
//
// `findings-list.tsx` (the v0.3 marketing audit view) uses different fallback
// colours for `info`-tier rows and intentionally keeps its own local helpers.

export type Severity = "critical" | "error" | "warning" | "info";

export function sevText(sev: Severity | string): string {
  if (sev === "critical" || sev === "error") return "text-destructive";
  if (sev === "warning") return "text-warning";
  return "text-muted-foreground";
}

export function sevDot(sev: Severity | string): string {
  if (sev === "critical" || sev === "error") return "bg-destructive";
  if (sev === "warning") return "bg-warning";
  return "bg-muted-foreground";
}

export function sevBorderBg(sev: Severity | string): string {
  if (sev === "critical" || sev === "error") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (sev === "warning") return "border-warning/40 bg-warning/10 text-warning";
  return "border-border/60 bg-card/60 text-muted-foreground";
}
