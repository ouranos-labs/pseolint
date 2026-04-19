import { Inngest, EventSchemas } from "inngest";

type Events = {
  "audit/requested": { data: { auditId: string; url: string; plan: "free" | "pro"; sampleSize: number } };
};

export const inngest = new Inngest({
  id: "pseolint-web",
  schemas: new EventSchemas().fromRecord<Events>(),
});
