"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ResyncSubscriptionButton(): React.ReactElement {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  const onClick = (): void => {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/sync", { method: "POST" });
        const json = await res.json();
        if (res.ok && json.plan === "pro") {
          setMsg("Found it. Reloading…");
          router.refresh();
        } else if (res.ok && json.note === "no_subscription") {
          setMsg("No active subscription found on Polar.");
        } else if (res.status === 503) {
          setMsg("Billing not configured.");
        } else {
          setMsg("Couldn't reach Polar. Try again in a moment.");
        }
      } catch {
        setMsg("Network error. Try again.");
      }
    });
  };

  return (
    <span>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-foreground underline underline-offset-2 hover:text-primary disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Resync from Polar"}
      </button>
      {msg && <span className="ml-2 text-foreground">{msg}</span>}
    </span>
  );
}
