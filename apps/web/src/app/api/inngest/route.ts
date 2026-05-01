import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { runAudit } from "@/inngest/functions/run-audit";
import { expireReports } from "@/inngest/functions/expire-reports";
import { cleanupRateLimits } from "@/inngest/functions/cleanup-rate-limits";
import { weeklyDigest } from "@/inngest/functions/weekly-digest";
import { monitorDomains } from "@/inngest/functions/monitor-domains";
import { autoVerifyDomains } from "@/inngest/functions/auto-verify-domains";
import { syncGsc } from "@/inngest/functions/sync-gsc";
import { runOrchestratorSession } from "@/inngest/functions/run-orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAudit, expireReports, cleanupRateLimits, weeklyDigest, monitorDomains, autoVerifyDomains, syncGsc, runOrchestratorSession],
});
