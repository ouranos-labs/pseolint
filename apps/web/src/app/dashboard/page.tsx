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
          <a
            href="/pricing"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Upgrade to monitoring →
          </a>
        </div>
        <section className="rounded-[22px] border border-border/60 bg-card/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Run a new audit</h2>
          <AuditForm />
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-foreground">Portfolio</h1>
        <AddDomainCard variant="compact" />
      </div>
      <PortfolioStrip domains={domains} userId={session.user.id} />
    </div>
  );
}
