"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type WorkspaceTabId = "overview" | "traffic" | "monitoring" | "settings";

export const WORKSPACE_TABS: { id: WorkspaceTabId; label: string; segment: string }[] = [
  { id: "overview", label: "Overview", segment: "" },
  { id: "traffic", label: "Traffic", segment: "traffic" },
  { id: "monitoring", label: "Monitoring", segment: "monitoring" },
  { id: "settings", label: "Settings", segment: "settings" },
];

/**
 * Which tab a pathname belongs to. Pure so it can be unit-tested without a
 * router: the interesting cases are all encoding-related (hosts are user data
 * and routinely contain dots, and punycode hosts contain `%` once encoded).
 *
 * Returns null for paths outside this workspace, and for deeper drill-downs
 * that shouldn't light up a tab (/url/[urlEncoded] is reached FROM overview but
 * isn't the overview).
 */
export function activeWorkspaceTab(pathname: string, host: string): WorkspaceTabId | null {
  // Match either encoding: Next gives us a decoded pathname in some navigations
  // and an encoded one in others, so accepting both avoids a tab that silently
  // stops highlighting for hosts needing escapes.
  const bases = [`/dashboard/${host}`, `/dashboard/${encodeURIComponent(host)}`];
  const base = bases.find((b) => pathname === b || pathname.startsWith(`${b}/`));
  if (!base) return null;

  const rest = pathname.slice(base.length).replace(/^\//, "");
  if (rest === "") return "overview";

  const segment = rest.split("/")[0];
  return WORKSPACE_TABS.find((t) => t.segment !== "" && t.segment === segment)?.id ?? null;
}

export function WorkspaceTabs({ host }: { host: string }) {
  const pathname = usePathname();
  const active = activeWorkspaceTab(pathname, host);

  return (
    <nav
      aria-label="Workspace sections"
      className="-mx-5 overflow-x-auto border-b border-border/60 px-5"
    >
      <ul className="flex min-w-max gap-1">
        {WORKSPACE_TABS.map((tab) => {
          const href = tab.segment
            ? `/dashboard/${encodeURIComponent(host)}/${tab.segment}`
            : `/dashboard/${encodeURIComponent(host)}`;
          const isActive = active === tab.id;
          return (
            <li key={tab.id}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center border-b-2 px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
