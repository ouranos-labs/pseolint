"use client";
import { useState, useTransition } from "react";
import { snoozeFinding, dismissFinding } from "@/app/dashboard/queue/actions";

type Finding = {
  id: string;
  ruleId: string;
  severityLatest: "info" | "warning" | "error" | "critical";
  affectedPageCount: number;
  rankScore: string;
  ruleMessageLatest: string;
  representativeUrl: string | null;
  status: "open" | "snoozed" | "dismissed";
};

const SEV_ORDER = ["critical", "error", "warning", "info"] as const;

export function FindingsPanel({ findings }: { findings: Finding[] }) {
  const [showSuppressed, setShowSuppressed] = useState(false);
  const groups = SEV_ORDER.map((s) => ({
    sev: s,
    rows: findings.filter((f) => f.severityLatest === s && (showSuppressed || f.status === "open")),
  }));
  const anyVisible = groups.some((g) => g.rows.length > 0);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Open findings</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showSuppressed} onChange={(e) => setShowSuppressed(e.target.checked)} />
          Show suppressed
        </label>
      </div>
      {groups.map((g) => g.rows.length > 0 && (
        <div key={g.sev} className="mb-5">
          <h3 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{g.sev}</h3>
          <ul className="divide-y divide-border/60 rounded-[22px] border border-border/60">
            {g.rows.map((f) => <FindingRow key={f.id} f={f} />)}
          </ul>
        </div>
      ))}
      {!anyVisible && <p className="text-sm text-muted-foreground">No open findings. Nice.</p>}
    </section>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-start gap-3 px-5 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs text-muted-foreground">{f.ruleId}</code>
          <span className="text-xs text-muted-foreground">· {f.affectedPageCount} pages · rank {Number(f.rankScore).toFixed(0)}</span>
        </div>
        <p className="mt-1 text-foreground">{f.ruleMessageLatest}</p>
        {f.representativeUrl && <p className="mt-1 truncate text-xs text-muted-foreground">{f.representativeUrl}</p>}
      </div>
      <div className="flex items-center gap-1">
        <button disabled={pending} onClick={() => start(() => snoozeFinding(f.id, 7))} className="rounded-[10px] px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">Snooze 7d</button>
        <button disabled={pending} onClick={() => start(() => dismissFinding(f.id))} className="rounded-[10px] px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">Dismiss</button>
      </div>
    </li>
  );
}
