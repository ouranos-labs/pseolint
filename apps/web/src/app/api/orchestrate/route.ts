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
  brief: z.string().max(4000).optional(),
});

const TIER_DEFAULT_BUDGET = { free: 1, pro: 3 };
const TIER_MAX_BUDGET = { free: 2, pro: 10 };

/**
 * Per-user daily orchestrator-session cap. Prevents runaway abuse on what is
 * a real-money endpoint — even Pro at $3/session × 50 = $150 of LLM spend
 * per user per day is uncomfortable. Free tier capped harder.
 */
const DAILY_SESSION_LIMIT = { free: 5, pro: 50 };

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

  // Per-user daily cap. Catches both honest over-use and abuse before the
  // session row + Inngest event are created — cheaper than discovering at
  // the LLM-billing boundary that a user kicked off 200 sessions overnight.
  const rateKey = `orchestrate:${session.user.id}:${new Date().toISOString().slice(0, 10)}`;
  const limit = DAILY_SESSION_LIMIT[plan];
  const { allowed, count } = await bumpRateLimit(rateKey, limit);
  if (!allowed) {
    return NextResponse.json(
      {
        error: "daily session limit reached",
        limit,
        used: count,
        plan,
      },
      { status: 429 },
    );
  }

  const [row] = await db
    .insert(orchestratorSessions)
    .values({
      userId: session.user.id,
      domain: parsed.data.domain,
      status: "queued",
      brief: parsed.data.brief ?? null,
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
