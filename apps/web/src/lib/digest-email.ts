import { Resend } from "resend";
import { render } from "@react-email/render";
import { db } from "@/db";
import { findingsState, monitoredDomains } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { env } from "@/lib/env";
import WeeklyDigestEmail, { type DigestItem } from "@/emails/WeeklyDigestEmail";

export async function sendWeeklyDigestTo(userId: string, userEmail: string): Promise<void> {
  const domains = await db.select().from(monitoredDomains).where(eq(monitoredDomains.userId, userId));
  if (domains.length === 0) return;

  const items: DigestItem[] = [];
  for (const d of domains) {
    const top = await db.select().from(findingsState)
      .where(and(eq(findingsState.domainId, d.id), eq(findingsState.status, "open")))
      .orderBy(desc(findingsState.rankScore))
      .limit(3);
    for (const f of top) {
      items.push({
        domainHost: d.host,
        ruleId: f.ruleId,
        message: f.ruleMessageLatest,
        affectedPages: f.affectedPageCount,
        detailUrl: `${env().BETTER_AUTH_URL}/dashboard/queue?focus=${f.id}`,
      });
    }
  }

  const top3 = items.sort((a, b) => b.affectedPages - a.affectedPages).slice(0, 3);
  if (top3.length === 0) return;

  const html = await render(WeeklyDigestEmail({ items: top3, appUrl: env().BETTER_AUTH_URL }));
  const resend = new Resend(env().RESEND_API_KEY);
  const n = top3.length;
  const { error } = await resend.emails.send({
    from: env().RESEND_FROM,
    to: userEmail,
    subject: `pseolint — ${n} fix${n === 1 ? "" : "es"} worth making this week`,
    html,
  });
  if (error) {
    // Log failure without exposing secrets; don't rethrow so digest continues for other users
    console.error(`[digest-email] Resend failed for ${userEmail}: ${error.message}`);
  }
}
