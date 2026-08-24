"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function AccountMenu({ email, plan }: { email: string; plan: "free" | "pro" }) {
  const initials = email.slice(0, 2).toUpperCase();
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleSignOut() {
    start(async () => {
      try {
        await authClient.signOut();
      } catch {
        // Best-effort: even if the API call fails, navigate away, the cookie
        // may already be cleared and staying on a dashboard page would 500.
      }
      // replace() (not push) so the back button doesn't bounce the user into
      // a page that re-checks the now-missing session and redirects again.
      router.replace("/");
      // refresh() invalidates the RSC cache so any server-rendered authenticated
      // shell on the destination is re-fetched without the old session.
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="inline-grid h-8 w-8 place-items-center rounded-full border border-border-strong bg-secondary text-[12px] font-mono text-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate">
          {email}
          <span className="ml-2 inline-flex items-center rounded-full border border-border/60 px-1.5 py-0.5 align-middle text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{plan}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {plan === "free" && (
          <DropdownMenuItem asChild>
            <Link href="/pricing" className="block w-full font-medium text-primary">Upgrade to Pro →</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings/account" className="block w-full">Account</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings/billing" className="block w-full">Billing</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={(e) => {
            e.preventDefault();
            handleSignOut();
          }}
          className="cursor-pointer text-muted-foreground"
        >
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
