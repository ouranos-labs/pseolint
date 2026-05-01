import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { orchestratorSessions } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { bumpRateLimit } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest";
import { auditLog } from "@/lib/audit-log";

export const runtime = "nodejs";

const requestSchema = z.object({
  domain: z.string().url().describe("Site to audit (e.g. https://example.com)"),
  /**
   * Per-tier defaults: free = $1, pro = $3. Caller can request a different
   * cap but it gets clamped to the tier's hard ceiling so an LLM-driven
   * client can't talk us into a $50 audit.
   */
  budgetUsd: z.number().positive().max(10).optional(),
});

const TIER_DEFAULT_BUDGET = { free: 1, pro: 3 };
const TIER_MAX_BUDGET = { free: 2, pro: 10 };

/**
 * Start an orchestrator audit session. Validates auth, enforces a tier-aware
 * USD cap, inserts a row in `orchestrator_session` with status=queued, and
 * dispatches an `orchestrator/requested` Inngest event so the long-running
 * audit happens off the request path.
 *
 * Returns `{ sessionId }` immediately — clients poll `/api/orchestrate/[id]`
 * (or subscribe to a future SSE endpoint) for live progress.
 */
export async function POST(req: Request): Promise<Response> {
  let session;
  try {
    session = await requireSession();
  } catch (r) {
    return r as Response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request", details: parsed.error.message }, { status: 400 });
  }

  const plan = await getPlan(session.user.id);
  const tierMax = TIER_MAX_BUDGET[plan];
  const tierDefault = TIER_DEFAULT_BUDGET[plan];
  const requested = parsed.data.budgetUsd ?? tierDefault;
  const budgetUsd = Math.min(requested, tierMax);

  const [row] = await db
    .insert(orchestratorSessions)
    .values({
      userId: session.user.id,
      domain: parsed.data.domain,
      status: "queued",
      budgetUsd: String(budgetUsd.toFixed(4)),
    })
    .returning({ id: orchestratorSessions.id });

  await inngest.send({
    name: "orchestrator/requested",
    data: { sessionId: row.id },
  });

  auditLog("orchestrator.started", {
    sessionId: row.id,
    userId: session.user.id,
    domain: parsed.data.domain,
    budgetUsd,
    plan,
  });

  return NextResponse.json({
    sessionId: row.id,
    budgetUsd,
    domain: parsed.data.domain,
    status: "queued",
  });
}
