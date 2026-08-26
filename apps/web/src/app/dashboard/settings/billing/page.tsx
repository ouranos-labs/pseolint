import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ResyncSubscriptionButton } from "./resync-button";
import { formatDate } from "@/lib/format";
import { TrackedLink } from "@/components/analytics/tracked-link";

export default async function BillingSettings() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  const plan = await getPlan(session.user.id);
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, session.user.id)).limit(1);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-xl font-medium">Billing</h1>
      <div className="rounded-[18px] border border-border/60 p-5">
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-medium capitalize text-foreground">{plan}</dd>
          {profile?.planExpiresAt && (
            <>
              <dt className="text-muted-foreground">{plan === "pro" ? "Renews" : "Expires"}</dt>
              <dd className="text-foreground">{formatDate(profile.planExpiresAt)}</dd>
            </>
          )}
        </dl>
        {plan === "free" ? (
          <div className="mt-4 flex flex-col gap-3">
            <TrackedLink href="/pricing" event={ { name: "upgrade_clicked", props: { source: "billing" } } } className="inline-flex h-10 w-fit items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Upgrade to Pro →</TrackedLink>
            <div className="rounded-[12px] border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Just paid and still seeing free?{" "}
              <ResyncSubscriptionButton />{" "}
              We'll fetch your subscription directly from Polar.
            </div>
          </div>
        ) : (
          <form action="/api/billing/portal" method="POST" className="mt-4">
            <button type="submit" className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm hover:bg-secondary">
              Manage in Polar →
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
