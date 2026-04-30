import { redirect } from "next/navigation";
import Link from "next/link";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";

type Section = {
  href: string;
  title: string;
  blurb: string;
  plans: ("free" | "pro")[];
};

const SECTIONS: Section[] = [
  {
    href: "/dashboard/settings/account",
    title: "Account",
    blurb: "Email, data export, and account deletion.",
    plans: ["free", "pro"],
  },
  {
    href: "/dashboard/settings/ai-key",
    title: "AI key",
    blurb: "Bring-your-own Anthropic key. Free tier requires it; Pro tier can opt in.",
    plans: ["free", "pro"],
  },
  {
    href: "/dashboard/settings/alerts",
    title: "Alerts",
    blurb: "Default risk-rise threshold and recipient emails for cross-domain monitoring.",
    plans: ["pro"],
  },
  {
    href: "/dashboard/settings/billing",
    title: "Billing",
    blurb: "Plan, renewal date, and Stripe portal.",
    plans: ["free", "pro"],
  },
  {
    href: "/dashboard/settings/tokens",
    title: "Upload tokens",
    blurb: "Tokens for the pseolint CLI and GitHub Action upload flow.",
    plans: ["free", "pro"],
  },
];

export default async function SettingsIndex() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?next=/dashboard/settings");
  const plan = await getPlan(session.user.id);
  const sections = SECTIONS.filter((s) => s.plans.includes(plan));

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Account-level configuration. For per-domain settings, open a domain and click Settings.</p>
      </div>
      <ul className="flex flex-col gap-3">
        {sections.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block rounded-[18px] border border-border/60 p-4 transition-colors hover:border-border-strong hover:bg-secondary/30"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{s.title}</span>
                <span className="text-xs text-muted-foreground">→</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{s.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
