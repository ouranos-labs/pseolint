"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCountdown, secondsUntil, type AuditErrorTone, type AuditErrorView } from "@/lib/audit-errors";

const TONE: Record<AuditErrorTone, { box: string; dot: string; title: string }> = {
  // Destructive red only for input the user can fix or a real server fault.
  danger: { box: "border-destructive/40 bg-destructive/5", dot: "bg-destructive", title: "text-destructive" },
  // Limits and reachability: not the user's fault, but worth attention.
  warning: { box: "border-warning/40 bg-warning/5", dot: "bg-warning", title: "text-foreground" },
  // Informational: a running audit, a pause, a block.
  neutral: { box: "border-border/70 bg-card/40", dot: "bg-muted-foreground", title: "text-foreground" },
};

/**
 * The one way every audit form renders a rejection: one cause, one action, an
 * optional "Why?" disclosure, and a live countdown that tells the form when to
 * re-enable its button (`onCooldownEnd`).
 */
export function AuditErrorNotice({
  view,
  onCooldownEnd,
  className = "",
}: {
  view: AuditErrorView;
  onCooldownEnd?: () => void;
  className?: string;
}) {
  const tone = TONE[view.tone];
  const remaining = useCountdown(view.cooldownUntil, onCooldownEnd);
  const external = view.action?.href.startsWith("mailto:");

  return (
    <div role="status" aria-live="polite" className={`rounded-[14px] border p-3 text-sm ${tone.box} ${className}`}>
      <p className={`flex items-start gap-2 ${tone.title}`}>
        <span aria-hidden className={`mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
        <span>{view.message}</span>
      </p>
      {view.cooldownUntil != null && remaining > 0 ? (
        <p className="mt-1 pl-3.5 text-xs text-muted-foreground">
          Try again in <span className="font-mono tabular-nums text-foreground">{formatCountdown(remaining)}</span>.
        </p>
      ) : view.hint ? (
        <p className="mt-1 pl-3.5 text-xs text-muted-foreground">{view.hint}</p>
      ) : null}
      {view.action &&
        (external ? (
          <a href={view.action.href} className="mt-2 ml-3.5 inline-flex text-xs font-medium text-primary hover:underline">
            {view.action.label} →
          </a>
        ) : (
          <Link href={view.action.href} className="mt-2 ml-3.5 inline-flex text-xs font-medium text-primary hover:underline">
            {view.action.label} →
          </Link>
        ))}
      {view.details && (
        <details className="mt-2 pl-3.5 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">{view.details.summary}</summary>
          <p className="mt-1 leading-relaxed">{view.details.body}</p>
        </details>
      )}
    </div>
  );
}

/** Seconds left until `until`; fires `onEnd` once when it reaches zero. */
export function useCountdown(until: number | undefined, onEnd?: () => void): number {
  const [left, setLeft] = useState(() => (until != null ? secondsUntil(until) : 0));
  useEffect(() => {
    if (until == null) {
      setLeft(0);
      return;
    }
    setLeft(secondsUntil(until));
    const id = setInterval(() => {
      const s = secondsUntil(until);
      setLeft(s);
      if (s <= 0) {
        clearInterval(id);
        onEnd?.();
      }
    }, 1000);
    return () => clearInterval(id);
    // onEnd is intentionally excluded: callers pass inline closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);
  return left;
}
