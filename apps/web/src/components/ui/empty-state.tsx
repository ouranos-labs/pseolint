import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "muted" | "success" | "warning" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  muted: "border-dashed border-border/60 bg-background/40",
  success: "border-success/30 bg-success/5",
  warning: "border-warning/40 bg-warning/5",
  info: "border-primary/25 bg-primary/5",
};

interface EmptyStateProps {
  /** Short headline. The "what's missing" line. */
  title: string;
  /** Supporting context: what would normally be here, or what to do next. */
  description?: ReactNode;
  /** Optional primary action (next/link). */
  action?: { href: string; label: string };
  /** Optional secondary action (next/link). */
  secondaryAction?: { href: string; label: string };
  /** Optional small eyebrow above title (e.g., "PORTFOLIO"). */
  eyebrow?: string;
  tone?: Tone;
  className?: string;
  /** Render arbitrary content below the action row (custom controls etc.). */
  children?: ReactNode;
}

export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  eyebrow,
  tone = "muted",
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[18px] border px-6 py-10 text-center",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {eyebrow && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </span>
      )}
      <p
        className={cn(
          "max-w-md text-base font-medium",
          tone === "success" ? "text-success" : "text-foreground",
        )}
      >
        {title}
      </p>
      {description && (
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {action && (
            <Link
              href={action.href}
              className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {action.label}
            </Link>
          )}
          {secondaryAction && (
            <Link
              href={secondaryAction.href}
              className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium transition-colors hover:bg-secondary"
            >
              {secondaryAction.label}
            </Link>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
