import { inngest } from "@/lib/inngest";
export const cleanupRateLimits = inngest.createFunction(
  { id: "cleanup-rate-limits" }, { cron: "0 2 * * *" }, async () => ({ ok: true }),
);
