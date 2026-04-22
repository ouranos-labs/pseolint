import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { alertDefaults } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { updateAlertDefaultsAction } from "../actions";

export default async function AlertSettings() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  if ((await getPlan(session.user.id)) !== "pro") redirect("/pricing");

  const [row] = await db.select().from(alertDefaults).where(eq(alertDefaults.userId, session.user.id)).limit(1);
  const recipients = (row?.recipientEmails ?? []).join(", ");

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-xl font-medium">Alert defaults</h1>
      <form action={updateAlertDefaultsAction} className="flex flex-col gap-5 rounded-[22px] border border-border/60 p-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Score drop threshold</span>
          <span className="text-xs text-muted-foreground">Triggers email when any monitored domain&apos;s score drops by this much.</span>
          <input name="scoreDropThreshold" type="number" min={1} defaultValue={row?.scoreDropThreshold ?? 10} className="mt-1 w-32 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Recipient emails</span>
          <span className="text-xs text-muted-foreground">Comma-separated. Leave blank to use your signed-in email.</span>
          <input name="recipientEmails" defaultValue={recipients} className="mt-1 rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="inline-flex h-10 w-fit items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save</button>
      </form>
    </div>
  );
}
