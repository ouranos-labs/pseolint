import "server-only";
import { Inngest, EventSchemas } from "inngest";
import { devFlags } from "@/lib/dev-flags";

type Events = {
  "audit/requested": {
    data: {
      auditId: string;
      url: string;
      plan: "free" | "pro";
      sampleSize: number;
      render?: boolean;
      mode?: "full" | "diff";
      /**
       * v0.5.3 watched-pages: URLs the engine must always re-fetch this run,
       * regardless of monitoring's diff-mode skip matrix. Threaded through to
       * `auditSource(..., { force: { urls } })` in run-audit.ts.
       */
      force?: { urls?: string[] };
    };
  };
  "audit/completed-for-monitoring": { data: { monitoredDomainId: string; auditId: string } };
  "orchestrator/requested": { data: { sessionId: string } };
  /**
   * Dispatched by the DELETE /api/orchestrate/[id] endpoint. Inngest matches
   * this against the function's cancelOn rule and aborts the in-flight
   * runOrchestratorSession invocation — preventing further LLM steps from
   * billing after a user clicks Cancel.
   */
  "orchestrator/cancel-requested": { data: { sessionId: string } };
  /**
   * On-demand GSC sync for a single domain. Triggered by POST /api/gsc/refresh/[host].
   * The sync-gsc function checks this event and runs immediately for the target domain.
   */
  "gsc/sync-requested": { data: { userId: string; domainId: string } };
};

const useLocalInngest = devFlags.inngestLocal;

export const inngest = new Inngest({
  id: "pseolint-web",
  schemas: new EventSchemas().fromRecord<Events>(),
  isDev: useLocalInngest,
  baseUrl: useLocalInngest ? process.env.INNGEST_BASE_URL ?? "http://localhost:8288" : undefined,
});
