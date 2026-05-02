"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type Item = {
  href: string;
  label: string;
  // When set, the item is considered active for these path prefixes (in addition to href).
  // Used so that "Settings" lights up on every /dashboard/settings/* page.
  activePrefixes?: string[];
  // Paths that should NOT activate this item even if they match href/activePrefixes.
  // Used so that "Settings" does NOT light up on /dashboard/settings/costs (Costs has its own item).
  excludePrefixes?: string[];
};

const PRO_ITEMS: Item[] = [
  { href: "/dashboard", label: "Portfolio" },
  { href: "/dashboard/manifests", label: "Manifests" },
  { href: "/dashboard/integrations", label: "Integrations" },
  { href: "/dashboard/settings/costs", label: "Costs" },
  {
    href: "/dashboard/settings",
    label: "Settings",
    activePrefixes: ["/dashboard/settings"],
    excludePrefixes: ["/dashboard/settings/costs"],
  },
];

const FREE_ITEMS: Item[] = [
  { href: "/dashboard", label: "History" },
  { href: "/dashboard/manifests", label: "Manifests" },
  { href: "/dashboard/settings/ai-key", label: "AI key" },
  {
    href: "/dashboard/settings",
    label: "Settings",
    activePrefixes: ["/dashboard/settings"],
    excludePrefixes: ["/dashboard/settings/ai-key"],
  },
];

function isActive(pathname: string, item: Item): boolean {
  if (item.excludePrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  if (pathname === item.href) return true;
  if (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)) return true;
  if (item.activePrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return false;
}

export function DashboardSidebar({ plan }: { plan: "free" | "pro" }) {
  const pathname = usePathname();
  const items = plan === "pro" ? PRO_ITEMS : FREE_ITEMS;
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border/60 px-4 py-6 md:flex">
      <ul className="flex flex-col gap-1">
        {items.map((it) => {
          const active = isActive(pathname, it);
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
      {plan === "free" && (
        <div className="mt-auto pt-6">
          <Link
            href="/pricing"
            className="block rounded-[14px] border border-primary/40 bg-primary/10 px-3 py-3 text-sm transition-colors hover:bg-primary/15"
          >
            <span className="block text-xs uppercase tracking-wider text-muted-foreground">Free plan</span>
            <span className="mt-0.5 block font-medium text-primary">Upgrade to Pro →</span>
            <span className="mt-1 block text-[11px] text-muted-foreground">Monitor, AI triage, alerts</span>
          </Link>
        </div>
      )}
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
          const active = isActive(pathname, it);
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
        {plan === "free" && (
          <li className="ml-auto">
            <Link
              href="/pricing"
              className="inline-flex shrink-0 items-center rounded-[12px] border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
            >
              Upgrade →
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
