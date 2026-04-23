import { Inngest, EventSchemas } from "inngest";
import { devFlags } from "@/lib/dev-flags";

type Events = {
  "audit/requested": { data: { auditId: string; url: string; plan: "free" | "pro"; sampleSize: number; render?: boolean; mode?: "full" | "diff" } };
  "audit/completed-for-monitoring": { data: { monitoredDomainId: string; auditId: string } };
};

const useLocalInngest = devFlags.inngestLocal;

export const inngest = new Inngest({
  id: "pseolint-web",
  schemas: new EventSchemas().fromRecord<Events>(),
  isDev: useLocalInngest,
  baseUrl: useLocalInngest ? process.env.INNGEST_BASE_URL ?? "http://localhost:8288" : undefined,
});
