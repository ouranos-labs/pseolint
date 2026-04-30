"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type Item = { href: string; label: string };

const PRO_ITEMS: Item[] = [
  { href: "/dashboard", label: "Portfolio" },
  { href: "/dashboard/integrations", label: "Integrations" },
  { href: "/dashboard/settings/costs", label: "Costs" },
  { href: "/dashboard/settings/account", label: "Settings" },
];

const FREE_ITEMS: Item[] = [
  { href: "/dashboard", label: "History" },
  { href: "/dashboard/settings/ai-key", label: "AI key" },
  { href: "/dashboard/settings/account", label: "Settings" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

export function DashboardSidebar({ plan }: { plan: "free" | "pro" }) {
  const pathname = usePathname();
  const items = plan === "pro" ? PRO_ITEMS : FREE_ITEMS;
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border/60 px-4 py-6 md:block">
      <ul className="flex flex-col gap-1">
        {items.map((it) => {
          const active = isActive(pathname, it.href);
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

/**
 * Mobile-only horizontal tab strip (< md). Paired with DashboardSidebar (hidden < md).
 * Horizontally scrollable to accommodate long item lists without crowding.
 */
export function DashboardTabs({ plan }: { plan: "free" | "pro" }) {
  const pathname = usePathname();
  const items = plan === "pro" ? PRO_ITEMS : FREE_ITEMS;
  return (
    <nav className="sticky top-14 z-20 -mx-5 mb-4 border-b border-border/60 bg-background/90 px-5 py-2 backdrop-blur md:hidden">
      <ul className="flex gap-1 overflow-x-auto">
        {items.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cn(
                  "inline-flex shrink-0 items-center rounded-[12px] px-3 py-1.5 text-xs transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
