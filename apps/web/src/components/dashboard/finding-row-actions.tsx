"use client";
import { useTransition } from "react";
import { snoozeFinding, dismissFinding } from "@/app/dashboard/_actions/findings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";

const SNOOZE_OPTIONS: { days: number; label: string }[] = [
  { days: 7, label: "1 week" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export function FindingRowActions({ findingId }: { findingId: string }) {
  const [pending, start] = useTransition();
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
            <DropdownMenuItem
              key={opt.days}
              onSelect={() => start(() => snoozeFinding(findingId, opt.days))}
            >
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
        onClick={() => start(() => dismissFinding(findingId))}
        className="rounded-[10px] border border-border/60 bg-card/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
      >
        Dismiss
      </button>
    </div>
  );
}
