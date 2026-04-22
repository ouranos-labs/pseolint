"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";

export function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-grid h-8 w-8 place-items-center rounded-full border border-border-strong bg-secondary text-[11px] font-mono text-foreground hover:bg-secondary/80"
        aria-label="Account menu"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-[14px] border border-border/70 bg-background shadow-lg">
          <div className="truncate border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">{email}</div>
          <Link href="/dashboard/settings/account" className="block px-3 py-2 text-sm hover:bg-secondary">Account</Link>
          <Link href="/dashboard/settings/billing" className="block px-3 py-2 text-sm hover:bg-secondary">Billing</Link>
          <form action="/api/auth/sign-out" method="post">
            <button type="submit" className="block w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
