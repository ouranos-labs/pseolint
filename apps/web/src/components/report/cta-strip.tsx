import Link from "next/link";
import { AddToMonitoringButton } from "./add-to-monitoring-button";

type Ctx =
  | { kind: "anon"; auditSlug: string; originUrl: string }
  | { kind: "free_own"; auditSlug: string; originUrl: string }
  | { kind: "free_other"; auditSlug: string; originUrl: string }
  | { kind: "pro_own_monitored"; auditSlug: string; originUrl: string; domainHost: string }
  | { kind: "pro_own_unmonitored"; auditSlug: string; originUrl: string }
  | { kind: "pro_other"; auditSlug: string; originUrl: string };

const BASE = "rounded-[18px] border border-border/70 bg-card/40 p-4 backdrop-blur-sm";
const PRIMARY = "inline-flex h-9 items-center rounded-[14px] bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90";
const SECONDARY = "inline-flex h-9 items-center rounded-[14px] border border-border-strong px-4 text-xs font-medium text-foreground hover:bg-secondary";

export function ReportCtaStrip(ctx: Ctx) {
  switch (ctx.kind) {
    case "anon":
      return (
        <div className={`${BASE} flex flex-wrap items-center justify-between gap-3`}>
          <p className="text-xs text-muted-foreground">
            Save this audit to your history — <Link href={`/signin?next=/r/${ctx.auditSlug}`} className="text-foreground underline-offset-4 hover:underline">sign in</Link>.
          </p>
          <Link href={`/pricing?intent=monitor&audit=${ctx.auditSlug}`} className={PRIMARY}>
            Monitor this domain with Pro →
          </Link>
        </div>
      );
    case "free_own":
    case "free_other":
      return (
        <div className={`${BASE} flex flex-wrap items-center justify-between gap-3`}>
          <p className="text-xs text-muted-foreground">
            {ctx.kind === "free_own" ? "Saved to your history." : "Shared audit — run your own to keep it in history."}
          </p>
          <Link href={`/pricing?intent=monitor&audit=${ctx.auditSlug}`} className={PRIMARY}>
            Monitor this domain →
          </Link>
        </div>
      );
    case "pro_own_monitored":
      return (
        <div className={`${BASE} flex flex-wrap items-center justify-between gap-3 border-primary/30 bg-primary/5`}>
          <p className="text-xs text-foreground">Already in your portfolio.</p>
          <Link href={`/dashboard/${encodeURIComponent(ctx.domainHost)}`} className={PRIMARY}>Open in dashboard →</Link>
        </div>
      );
    case "pro_own_unmonitored":
      return (
        <div className={`${BASE} flex flex-wrap items-center justify-between gap-3`}>
          <p className="text-xs text-muted-foreground">Not currently monitored.</p>
          <AddToMonitoringButton originUrl={ctx.originUrl} className={PRIMARY}>+ Add to monitoring</AddToMonitoringButton>
        </div>
      );
    case "pro_other":
      return (
        <div className={`${BASE} flex flex-wrap items-center justify-between gap-3`}>
          <p className="text-xs text-muted-foreground">Shared report — not one of your monitored domains.</p>
          <AddToMonitoringButton originUrl={ctx.originUrl} className={SECONDARY}>+ Add to monitoring</AddToMonitoringButton>
        </div>
      );
  }
}
