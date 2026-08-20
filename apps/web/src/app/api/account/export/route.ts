import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { audits, monitoredDomains, userProfiles, users, alertDefaults, findingsState, integrations, uploadTokens, usageLog } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GDPR Article 20: Right to data portability. Returns a JSON dump of every
 * row owned by the current user, scoped by userId FK. Excludes sensitive
 * columns that shouldn't leave the server (password hashes, OAuth refresh
 * tokens, encrypted integration credentials, upload-token hashes).
 */
export async function GET(): Promise<Response> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const [user] = await db
    .select({
      id: users.id, name: users.name, email: users.email,
      emailVerified: users.emailVerified, image: users.image,
      createdAt: users.createdAt, updatedAt: users.updatedAt,
    })
    .from(users).where(eq(users.id, userId)).limit(1);

  const [profile] = await db
    .select({
      plan: userProfiles.plan, planExpiresAt: userProfiles.planExpiresAt,
      createdAt: userProfiles.createdAt,
      // polarCustomerId intentionally omitted (internal billing identifier).
    })
    .from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);

  const [auditRows, domains, alerts, findings, integrationRows, tokens, usage] = await Promise.all([
    db.select({
      slug: audits.slug, sourceUrl: audits.sourceUrl, status: audits.status,
      isPublic: audits.isPublic, risk: audits.risk, pageCount: audits.pageCount,
      findingCount: audits.findingCount, triageRootCauseCount: audits.triageRootCauseCount,
      triageCostUsd: audits.triageCostUsd, createdAt: audits.createdAt,
      completedAt: audits.completedAt, expiresAt: audits.expiresAt,
    }).from(audits).where(eq(audits.userId, userId)),
    db.select({
      slug: monitoredDomains.slug, host: monitoredDomains.host, sourceUrl: monitoredDomains.sourceUrl,
      cadence: monitoredDomains.cadence, paused: monitoredDomains.paused,
      alertEmail: monitoredDomains.alertEmail, alertThreshold: monitoredDomains.alertThreshold,
      lastRisk: monitoredDomains.lastRisk, lastRunAt: monitoredDomains.lastRunAt,
      verifiedAt: monitoredDomains.verifiedAt, removedAt: monitoredDomains.removedAt,
      createdAt: monitoredDomains.createdAt,
    }).from(monitoredDomains).where(eq(monitoredDomains.userId, userId)),
    db.select().from(alertDefaults).where(eq(alertDefaults.userId, userId)),
    db.select({
      ruleId: findingsState.ruleId, templateSignature: findingsState.templateSignature,
      severityLatest: findingsState.severityLatest, affectedPageCount: findingsState.affectedPageCount,
      rankScore: findingsState.rankScore, status: findingsState.status,
      firstSeenAt: findingsState.firstSeenAt, lastSeenAt: findingsState.lastSeenAt,
      representativeUrl: findingsState.representativeUrl,
    }).from(findingsState)
      .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
      .where(eq(monitoredDomains.userId, userId)),
    db.select({
      kind: integrations.kind, scope: integrations.scope,
      lastSyncAt: integrations.lastSyncAt, createdAt: integrations.createdAt,
      // encryptedTokens intentionally omitted.
    }).from(integrations).where(eq(integrations.userId, userId)),
    db.select({
      label: uploadTokens.label, createdAt: uploadTokens.createdAt,
      lastUsedAt: uploadTokens.lastUsedAt, revokedAt: uploadTokens.revokedAt,
      // tokenHash intentionally omitted.
    }).from(uploadTokens).where(eq(uploadTokens.userId, userId)),
    db.select().from(usageLog).where(eq(usageLog.userId, userId)),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    user,
    profile: profile ?? null,
    audits: auditRows,
    monitoredDomains: domains,
    alertDefaults: alerts[0] ?? null,
    findings,
    integrations: integrationRows,
    uploadTokens: tokens,
    usageLog: usage,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="pseolint-export-${userId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
