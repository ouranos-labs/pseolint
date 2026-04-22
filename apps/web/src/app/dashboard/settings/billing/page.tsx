import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function BillingSettings() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  const plan = await getPlan(session.user.id);
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, session.user.id)).limit(1);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-xl font-medium">Billing</h1>
      <div className="rounded-[22px] border border-border/60 p-5">
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-medium capitalize text-foreground">{plan}</dd>
          {profile?.planExpiresAt && (
            <>
              <dt className="text-muted-foreground">{plan === "pro" ? "Renews" : "Expires"}</dt>
              <dd className="text-foreground">{new Date(profile.planExpiresAt).toLocaleDateString()}</dd>
            </>
          )}
        </dl>
        {plan === "free" ? (
          <a href="/pricing" className="mt-4 inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Upgrade to Pro →</a>
        ) : (
          <a href="https://polar.sh/account" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm hover:bg-secondary">Manage in Polar →</a>
        )}
      </div>
    </div>
  );
}
