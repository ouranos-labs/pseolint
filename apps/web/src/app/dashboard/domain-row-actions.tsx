"use client";
import { useTransition } from "react";
import { togglePauseMonitoredDomain, removeMonitoredDomain } from "./actions";

export function DomainRowActions({ id, paused }: { id: string; paused: boolean }) {
  const [pending, start] = useTransition();

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => togglePauseMonitoredDomain(id).then(() => undefined))}
        className="rounded-[10px] border border-border-strong px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
      >
        {paused ? "Resume" : "Pause"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Stop monitoring this domain?")) return;
          start(() => removeMonitoredDomain(id).then(() => undefined));
        }}
        className="rounded-[10px] border border-destructive/40 px-2.5 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  );
}
