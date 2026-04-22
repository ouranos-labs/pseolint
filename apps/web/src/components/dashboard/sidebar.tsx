"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type Item = { href: string; label: string };

const PRO_ITEMS: Item[] = [
  { href: "/dashboard", label: "Portfolio" },
  { href: "/dashboard/queue", label: "Queue" },
  { href: "/dashboard/integrations", label: "Integrations" },
  { href: "/dashboard/settings/account", label: "Settings" },
];

const FREE_ITEMS: Item[] = [
  { href: "/dashboard", label: "History" },
  { href: "/dashboard/settings/account", label: "Settings" },
];

export function DashboardSidebar({ plan }: { plan: "free" | "pro" }) {
  const pathname = usePathname();
  const items = plan === "pro" ? PRO_ITEMS : FREE_ITEMS;
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border/60 px-4 py-6 md:block">
      <ul className="flex flex-col gap-1">
        {items.map((it) => {
          const active =
            pathname === it.href ||
            (it.href !== "/dashboard" && pathname.startsWith(it.href));
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cn(
                  "block rounded-[12px] px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
