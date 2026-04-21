import { cn } from "@/lib/cn";

type Tone = "primary" | "success" | "warning" | "destructive" | "muted";
type Line = { glyph: string; tone: Tone; body: string };

const LINES: Line[] = [
  { glyph: "$", tone: "primary", body: "pseolint https://airport-hotels.example --ai" },
  { glyph: "✓", tone: "success", body: "crawled 182 pages in 14.3s" },
  { glyph: "✗", tone: "destructive", body: "E02 doorway /hotel-[city] · ×134 · critical" },
  { glyph: "✗", tone: "destructive", body: "E03 duplicate template · ×12 · critical" },
  { glyph: "⚠", tone: "warning", body: "W07 title stuffing · ×41 · error" },
  { glyph: "⚠", tone: "warning", body: "W17 stuffed h2 · ×18 · warning" },
  { glyph: "=", tone: "destructive", body: "score 87 · risky" },
  { glyph: "$", tone: "primary", body: "pseolint ./out --threshold 40 --format json" },
  { glyph: "✓", tone: "success", body: "cache hit · 304 · state.json unchanged for 164 urls" },
  { glyph: "→", tone: "primary", body: "triage: 3 ranked root causes · $0.04 spend" },
  { glyph: "$", tone: "primary", body: "pseolint https://yoursite.com --cache --state --since" },
  { glyph: "✓", tone: "success", body: "delta mode · re-audited 12 of 2,184 urls" },
];

function toneClass(tone: Tone): string {
  switch (tone) {
    case "primary":
      return "text-primary";
    case "success":
      return "text-success";
    case "warning":
      return "text-warning";
    case "destructive":
      return "text-destructive";
    case "muted":
      return "text-muted-foreground";
  }
}

function LineTrack({ lines }: { lines: Line[] }) {
  return (
    <div className="inline-flex items-center whitespace-nowrap">
      {lines.map((line, i) => (
        <span key={i} className="inline-flex items-center gap-2 pr-8">
          <span className={cn("font-semibold", toneClass(line.tone))}>{line.glyph}</span>
          <span className="text-muted-foreground">{line.body}</span>
          <span aria-hidden className="pl-6 text-muted-foreground/30">
            •
          </span>
        </span>
      ))}
    </div>
  );
}

export function CliMarquee({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "marquee-wrap border-y border-border/60 bg-background/50",
        className,
      )}
    >
      <div className="marquee-track font-mono text-[11px]">
        <LineTrack lines={LINES} />
        <LineTrack lines={LINES} />
      </div>
    </div>
  );
}
