import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { runAudit } from "@/inngest/functions/run-audit";
import { expireReports } from "@/inngest/functions/expire-reports";
import { cleanupRateLimits } from "@/inngest/functions/cleanup-rate-limits";
import { monitorDomains } from "@/inngest/functions/monitor-domains";

export const runtime = "nodejs";
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest, functions: [runAudit, expireReports, cleanupRateLimits, monitorDomains],
});
