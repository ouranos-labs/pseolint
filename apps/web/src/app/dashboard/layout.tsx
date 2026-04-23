import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { DashboardSidebar, DashboardTabs } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?next=/dashboard");
  const plan = await getPlan(session.user.id);
  return (
    <div className="mx-auto flex max-w-5xl gap-6 px-5">
      <DashboardSidebar plan={plan} />
      <div className="min-w-0 flex-1 py-6">
        <DashboardTabs plan={plan} />
        {children}
      </div>
    </div>
  );
}
