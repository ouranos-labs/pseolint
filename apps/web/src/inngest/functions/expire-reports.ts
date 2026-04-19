import { inngest } from "@/lib/inngest";
export const expireReports = inngest.createFunction(
  { id: "expire-reports" }, { cron: "0 3 * * *" }, async () => ({ ok: true }),
);
