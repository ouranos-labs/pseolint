import { gradeOf } from "@/lib/grade";

interface GradeChipProps {
  risk: number | null;
  /** Visual weight. `default` is the standard 28-px chip used on cards;
   *  `lg` is for the per-host hero where the chip sits next to the big number. */
  size?: "default" | "lg";
  /** Render the numeric score next to the letter. */
  showNumber?: boolean;
}

export function GradeChip({ risk, size = "default", showNumber = true }: GradeChipProps) {
  const grade = gradeOf(risk);
  const dim =
    size === "lg" ? "h-10 w-10 text-lg" : "h-7 w-7 text-sm";

  return (
    <span className="inline-flex items-center gap-2" title={`Grade ${grade.letter} · ${grade.band}`}>
      <span
        className={`inline-flex items-center justify-center rounded-md font-mono font-bold ${dim} ${grade.bg} ${grade.text}`}
      >
        {grade.letter}
      </span>
      {showNumber && (
        <span
          className={`font-mono font-semibold tabular-nums text-foreground ${size === "lg" ? "text-2xl" : "text-sm"}`}
        >
          {risk ?? "—"}
        </span>
      )}
    </span>
  );
}
