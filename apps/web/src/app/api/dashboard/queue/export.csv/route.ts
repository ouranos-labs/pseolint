import { NextResponse } from "next/server";
import { db } from "@/db";
import { findingsState, monitoredDomains } from "@/db/schema";
import { and, eq, desc, isNull } from "drizzle-orm";
import { getOptionalSession } from "@/lib/session";

export const runtime = "nodejs";

function csvEscape(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request): Promise<Response> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const domainHostRaw = new URL(req.url).searchParams.get("domain");
  const domainHost = domainHostRaw ? decodeURIComponent(domainHostRaw) : null;

  const where = [eq(monitoredDomains.userId, session.user.id), eq(findingsState.status, "open")];
  if (domainHost) {
    const [dom] = await db
      .select({ id: monitoredDomains.id })
      .from(monitoredDomains)
      .where(and(
        eq(monitoredDomains.userId, session.user.id),
        eq(monitoredDomains.host, domainHost),
        isNull(monitoredDomains.removedAt),
      ))
      .limit(1);
    if (!dom) return new Response("domain,rule_id,severity,message,template_signature,affected_pages,example_url,rank_score", { headers: { "content-type": "text/csv; charset=utf-8" } });
    where.push(eq(findingsState.domainId, dom.id));
  }

  const rows = await db.select({
    host: monitoredDomains.host, ruleId: findingsState.ruleId,
    severity: findingsState.severityLatest, message: findingsState.ruleMessageLatest,
    signature: findingsState.templateSignature, affected: findingsState.affectedPageCount,
    representativeUrl: findingsState.representativeUrl, rank: findingsState.rankScore,
  }).from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...where))
    .orderBy(desc(findingsState.rankScore));

  const lines = [
    ["domain", "rule_id", "severity", "message", "template_signature", "affected_pages", "example_url", "rank_score"].join(","),
    ...rows.map((r) => [r.host, r.ruleId, r.severity, r.message, r.signature, r.affected, r.representativeUrl ?? "", r.rank].map(csvEscape).join(",")),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pseolint-fix-queue-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
