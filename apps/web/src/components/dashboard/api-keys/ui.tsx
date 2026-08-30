"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

export const FIELD =
  "w-full min-w-0 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
export const BTN =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[14px] px-3 text-xs font-medium transition-colors disabled:opacity-50";
export const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:bg-primary/90`;
export const BTN_GHOST = `${BTN} border border-border-strong bg-background text-foreground hover:bg-secondary`;

/** Card chrome shared by the three credential sections. */
export function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[18px] border border-border/60 p-5">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{blurb}</div>
      {children}
    </section>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className ?? BTN_GHOST}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard is blocked in some embedded/insecure contexts. Say so
          // rather than flashing a success state that did not happen.
          toast.error("Couldn't copy. Select the text and copy manually.");
        }
      }}
      aria-live="polite"
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}

/**
 * Two-step destructive confirm.
 *
 * Not `window.confirm`: a native modal blocks the whole page (and is
 * unstyleable), and a full dialog component is more machinery than one
 * irreversible button needs. First click arms, second commits, and it disarms
 * itself after a few seconds so an armed button never sits there waiting to be
 * hit by accident.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Confirm?",
  className,
}: {
  onConfirm: () => Promise<void>;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();

  if (!armed) {
    return (
      <button
        type="button"
        className={className ?? "text-xs text-destructive underline hover:no-underline"}
        onClick={() => {
          setArmed(true);
          setTimeout(() => setArmed(false), 4000);
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      className="inline-flex h-7 items-center rounded-[10px] bg-destructive px-2.5 text-xs font-medium text-destructive-foreground disabled:opacity-50"
      onClick={() => start(async () => { await onConfirm(); setArmed(false); })}
    >
      {pending ? "Working…" : confirmLabel}
    </button>
  );
}

/**
 * The one-time secret panel.
 *
 * Every token here is shown exactly once. Making that visually loud, and
 * putting Copy inside the same box as the value, is the difference between a
 * user keeping their token and having to immediately issue another.
 */
export function OneTimeSecret({
  token,
  onDismiss,
  children,
}: {
  token: string;
  onDismiss: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-[12px] border border-success/40 bg-success/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-success">
          Copy it now — it is never shown again
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
      <div className="mt-2 flex items-start gap-2">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-[8px] bg-background p-2 font-mono text-[11px] text-foreground">
          {token}
        </pre>
        <CopyButton value={token} />
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 rounded-[12px] border border-dashed border-border/60 p-5 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

/** Row chrome for a listed credential. Wraps rather than squeezes on mobile. */
export function KeyRow({ children }: { children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[10px] border border-border/50 bg-card/30 px-3 py-2">
      {children}
    </li>
  );
}
