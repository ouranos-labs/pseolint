"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { snoozeFinding, dismissFinding, restoreFinding } from "@/app/dashboard/_actions/findings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";

export const SNOOZE_OPTIONS: { days: number; label: string }[] = [
  { days: 7, label: "1 week" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

type TriageStatus = "open" | "snoozed" | "dismissed";

/**
 * Snooze / dismiss with the dashboard's reversible-action pattern: the row
 * updates immediately, a toast says what happened and offers Undo, and a
 * failure rolls the row back and says so. Neither action destroys data, so an
 * undo toast replaces a confirm dialog.
 *
 * `status` is the optimistic override (null = use the server's value).
 */
export function useFindingTriage(findingId: string) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<TriageStatus | null>(null);

  function apply(next: Exclude<TriageStatus, "open">, run: () => Promise<void>, done: string) {
    const before = status;
    setStatus(next);
    start(async () => {
      try {
        await run();
      } catch {
        setStatus(before);
        toast.error(`Couldn't ${next === "snoozed" ? "snooze" : "dismiss"} this finding. It's back in your queue; try again.`);
        return;
      }
      toast.success(done, {
        action: { label: "Undo", onClick: () => undo(next) },
      });
    });
  }

  function undo(from: Exclude<TriageStatus, "open">) {
    setStatus("open");
    start(async () => {
      try {
        await restoreFinding(findingId);
        toast.success("Finding restored to your queue.");
      } catch {
        setStatus(from);
        toast.error("Couldn't undo. The finding is still " + from + "; reload the page and try again.");
      }
    });
  }

  return {
    pending,
    status,
    snooze: (days: number) =>
      apply("snoozed", () => snoozeFinding(findingId, days), `Finding snoozed until ${formatDate(Date.now() + days * 86_400_000)}.`),
    dismiss: () => apply("dismissed", () => dismissFinding(findingId), "Finding dismissed."),
  };
}

export function FindingRowActions({ findingId }: { findingId: string }) {
  const { pending, status, snooze, dismiss } = useFindingTriage(findingId);
  if (status === "snoozed" || status === "dismissed") {
    return (
      <span className="font-mono text-[11px] text-muted-foreground">
        {status === "snoozed" ? "Snoozed" : "Dismissed"}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          className="rounded-[10px] border border-border/60 bg-card/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground disabled:opacity-50"
        >
          Snooze ▾
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[8rem]">
          {SNOOZE_OPTIONS.map((opt) => (
            <DropdownMenuItem key={opt.days} onSelect={() => snooze(opt.days)}>
              <span className="font-mono text-xs">{opt.label}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                until {formatDate(Date.now() + opt.days * 86_400_000)}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        disabled={pending}
        onClick={dismiss}
        className="rounded-[10px] border border-border/60 bg-card/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
      >
        Dismiss
      </button>
    </div>
  );
}
