"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { TrackedLink } from "@/components/analytics/tracked-link";

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

// Grouped so the AI workflow (fix manifests + their cost) reads as one section
// instead of being scattered through a flat list. Untitled groups render with
// no header. Mobile flattens groups (see itemsOf).
type Group = { title?: string; items: Item[] };

const PRO_GROUPS: Group[] = [
  { items: [{ href: "/dashboard", label: "Portfolio" }] },
  {
    title: "AI",
    items: [
      { href: "/dashboard/manifests", label: "Fix manifests" },
      { href: "/dashboard/settings/costs", label: "Usage & cost" },
    ],
  },
  {
    title: "Setup",
    items: [
      { href: "/dashboard/integrations", label: "Integrations" },
      {
        href: "/dashboard/settings",
        label: "Settings",
        activePrefixes: ["/dashboard/settings"],
        excludePrefixes: ["/dashboard/settings/costs"],
      },
    ],
  },
];

const FREE_GROUPS: Group[] = [
  { items: [{ href: "/dashboard", label: "History" }] },
  {
    title: "AI",
    items: [
      { href: "/dashboard/manifests", label: "Fix manifests" },
      { href: "/dashboard/settings/ai-key", label: "AI key" },
    ],
  },
  {
    title: "Setup",
    items: [
      {
        href: "/dashboard/settings",
        label: "Settings",
        activePrefixes: ["/dashboard/settings"],
        excludePrefixes: ["/dashboard/settings/ai-key"],
      },
    ],
  },
];

const itemsOf = (groups: Group[]): Item[] => groups.flatMap((g) => g.items);

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
  const groups = plan === "pro" ? PRO_GROUPS : FREE_GROUPS;
  return (
    <aside className="sticky top-0 hidden h-[calc(100vh-3.5rem-1px)] w-56 shrink-0 self-start flex-col overflow-y-auto border-r border-border/60 px-4 py-6 md:flex">
      <div className="flex flex-col gap-5">
        {groups.map((group, gi) => (
          <div key={group.title ?? `g${gi}`}>
            {group.title && (
              <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {group.title}
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {group.items.map((it) => {
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
          </div>
        ))}
      </div>
      {plan === "free" && (
        <div className="mt-auto pt-6">
          <TrackedLink
            href="/pricing"
            event={ { name: "upgrade_clicked", props: { source: "sidebar" } } }
            className="block rounded-[14px] border border-primary/40 bg-primary/10 px-3 py-3 text-sm transition-colors hover:bg-primary/15"
          >
            <span className="block text-xs uppercase tracking-wider text-muted-foreground">Free plan</span>
            <span className="mt-0.5 block font-medium text-primary">Upgrade to Pro →</span>
            <span className="mt-1 block text-[11px] text-muted-foreground">Monitor, AI triage, alerts</span>
          </TrackedLink>
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
  const items = itemsOf(plan === "pro" ? PRO_GROUPS : FREE_GROUPS);
  return (
    <nav className="sticky top-0 z-20 -mx-5 mb-4 border-b border-border/60 bg-background/90 px-5 py-2 backdrop-blur md:hidden">
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
            <TrackedLink
              href="/pricing"
              event={ { name: "upgrade_clicked", props: { source: "sidebar" } } }
              className="inline-flex shrink-0 items-center rounded-[12px] border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
            >
              Upgrade →
            </TrackedLink>
          </li>
        )}
      </ul>
    </nav>
  );
}
