import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?next=/dashboard");
  const [profile] = await db
    .select({ plan: userProfiles.plan, expires: userProfiles.planExpiresAt })
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);
  const plan: "free" | "pro" =
    profile?.plan === "pro" && (!profile.expires || profile.expires > new Date())
      ? "pro"
      : "free";
  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-5">
      <DashboardSidebar plan={plan} />
      <div className="min-w-0 flex-1 py-6">{children}</div>
    </div>
  );
}
