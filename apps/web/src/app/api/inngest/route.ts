import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { runAudit } from "@/inngest/functions/run-audit";
import { expireReports } from "@/inngest/functions/expire-reports";
import { cleanupRateLimits } from "@/inngest/functions/cleanup-rate-limits";
import { weeklyDigest } from "@/inngest/functions/weekly-digest";
import { monitorDomains } from "@/inngest/functions/monitor-domains";
import { autoVerifyDomains } from "@/inngest/functions/auto-verify-domains";
import { syncGsc } from "@/inngest/functions/sync-gsc";
import { syncGscOnDemand } from "@/inngest/functions/sync-gsc-on-demand";
import { syncGrowthMetrics } from "@/inngest/functions/sync-growth-metrics";
import { runOrchestratorSession } from "@/inngest/functions/run-orchestrator";
import { expireOrchestratorSessions } from "@/inngest/functions/expire-orchestrator-sessions";
import { seedLeaderboard } from "@/inngest/functions/seed-leaderboard";

export const runtime = "nodejs";
export const maxDuration = 300;

const handler = serve({
  client: inngest,
  functions: [runAudit, expireReports, cleanupRateLimits, weeklyDigest, monitorDomains, autoVerifyDomains, syncGsc, syncGscOnDemand, runOrchestratorSession, expireOrchestratorSessions, seedLeaderboard, syncGrowthMetrics],
});

import { NextRequest } from "next/server";

export async function GET(request: NextRequest, context: { params: Promise<Record<string, string>> }) {
  return handler.GET(
    request as unknown as Parameters<typeof handler.GET>[0],
    context as unknown as Parameters<typeof handler.GET>[1]
  );
}

export async function POST(request: NextRequest, context: { params: Promise<Record<string, string>> }) {
  return handler.POST(
    request as unknown as Parameters<typeof handler.POST>[0],
    context as unknown as Parameters<typeof handler.POST>[1]
  );
}

export async function PUT(request: NextRequest, context: { params: Promise<Record<string, string>> }) {
  return handler.PUT(
    request as unknown as Parameters<typeof handler.PUT>[0],
    context as unknown as Parameters<typeof handler.PUT>[1]
  );
}



