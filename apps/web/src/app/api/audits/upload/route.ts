import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { uploadTokens, monitoredDomains } from "@/db/schema";
import { verifyUploadToken } from "@/lib/upload-token";
import { mergeFindings } from "@/lib/findings-state";
import { and, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { RuleResult } from "@pseolint/core";

export const runtime = "nodejs";

const FindingSchema = z.object({
  ruleId: z.string(),
  severity: z.enum(["info", "warning", "error", "critical"]),
  message: z.string(),
  pageUrl: z.string().optional(),
  relatedUrls: z.array(z.string()).optional(),
});

const GradeSchema = z.enum(["A", "B", "C", "D", "F"]);

const CategoryGradeSchema = z.object({
  grade: GradeSchema,
  issues: z.number(),
});

const BodySchema = z.object({
  domainId: z.string().uuid(),
  summary: z.object({
    schemaVersion: z.string(),
    verdict: z.enum(["ready", "caution", "concerning", "critical"]),
    risk: z.number(),
    headline: z.string().optional(),
    pageCount: z.number(),
    categories: z.object({
      integrity: CategoryGradeSchema,
      discoverability: CategoryGradeSchema,
      citation: CategoryGradeSchema,
      data: CategoryGradeSchema,
      audit: CategoryGradeSchema.optional(),
    }).passthrough(),
    issues: z.object({
      blockers: z.array(FindingSchema).max(10_000),
      shouldFix: z.array(FindingSchema).max(10_000),
      informational: z.array(FindingSchema).max(10_000),
    }),
    diagnostics: z.unknown().optional(),
  }).passthrough(),
});

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const [row] = await db
    .select()
    .from(uploadTokens)
    .where(and(eq(uploadTokens.tokenHash, tokenHash), isNull(uploadTokens.revokedAt)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!(await verifyUploadToken(token, row.tokenHash))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: `bad request: ${(e as Error).message}` }, { status: 400 });
  }

  // Ownership check: confirm the domain belongs to the token's owner.
  const [domain] = await db
    .select()
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.id, parsed.domainId), eq(monitoredDomains.userId, row.userId)))
    .limit(1);
  if (!domain) return NextResponse.json({ error: "domain_not_found" }, { status: 404 });

  await db
    .update(uploadTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(uploadTokens.id, row.id));

  const allFindings = [
    ...parsed.summary.issues.blockers,
    ...parsed.summary.issues.shouldFix,
    ...parsed.summary.issues.informational,
  ];
  await mergeFindings(parsed.domainId, allFindings as RuleResult[]);

  return NextResponse.json({ ok: true, ingested: allFindings.length });
}
