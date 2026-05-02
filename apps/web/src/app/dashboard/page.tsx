import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { AuditForm } from "@/components/dashboard/audit-form";
import { HistoryList } from "@/components/dashboard/history-list";
import { AddDomainCard } from "@/components/dashboard/add-domain-card";
import { PortfolioStrip } from "@/components/dashboard/portfolio-strip";
import { CrossDomainFixQueue } from "@/components/dashboard/cross-domain-fix-queue";
import { StartOrchestratorButton } from "@/components/dashboard/start-orchestrator-button";

export const runtime = "nodejs";

export default async function DashboardHome() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?next=/dashboard");

  const plan = await getPlan(session.user.id);

  if (plan === "free") {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-medium text-foreground">Your audits</h1>
          <Link
            href="/pricing"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Upgrade to monitoring →
          </Link>
        </div>
        <section className="rounded-[18px] border border-border/60 bg-card/40 p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Run a new audit</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            One-shot crawl + score. Up to 200 pages. Public report URL valid for 30 days.
          </p>
          <AuditForm />
        </section>
        <section className="rounded-[18px] border border-primary/30 bg-primary/5 p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">AI orchestrator (beta)</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            An LLM drives 25 audit tools and produces concrete fix patches — H1 rewrites, JSON-LD blocks, robots.txt diffs. Owner-private manifest with copy-paste UI. Costs $1-3 per audit.
          </p>
          <StartOrchestratorButton />
        </section>
        <HistoryList userId={session.user.id} />
      </div>
    );
  }

  // Pro branch
  const domains = await db
    .select()
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.userId, session.user.id), isNull(monitoredDomains.removedAt)));

  if (!domains.length) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-medium text-foreground">Portfolio</h1>
        <AddDomainCard variant="hero" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-foreground">Portfolio</h1>
        <AddDomainCard variant="compact" />
      </div>
      <PortfolioStrip domains={domains} userId={session.user.id} />
      <section className="rounded-[18px] border border-primary/30 bg-primary/5 p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">AI orchestrator (beta)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Generate a fix manifest with concrete copy-paste patches. Pro budget cap defaults to $3/session.
        </p>
        <StartOrchestratorButton />
      </section>
      <CrossDomainFixQueue userId={session.user.id} />
    </div>
  );
}
