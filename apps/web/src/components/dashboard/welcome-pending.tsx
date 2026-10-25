"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 3_000;
const GIVE_UP_MS = 60_000;

/**
 * Shown on /dashboard?welcome=1 while the plan is still free: Polar has taken the
 * payment but neither the webhook nor the server-side sync has flipped us to Pro
 * yet. Polls the self-heal endpoint; as soon as it reports Pro, a refresh
 * re-renders the page on the Pro branch (welcome=1 stays, so it confirms).
 */
export function WelcomePending(): React.ReactElement {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const [round, setRound] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    done.current = false;
    setTimedOut(false);
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async (): Promise<void> => {
      try {
        const res = await fetch("/api/billing/sync", { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as { plan?: string };
        if (res.ok && json.plan === "pro") {
          done.current = true;
          router.refresh();
          return;
        }
      } catch {
        // Network blip: keep polling until the deadline.
      }
      if (done.current) return;
      if (Date.now() - started >= GIVE_UP_MS) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    void tick();

    return () => {
      done.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [round, router]);

  const retry = useCallback(() => setRound((r) => r + 1), []);

  if (!timedOut) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-[14px] border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
        <span aria-hidden className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
        Payment received, activating Pro…
      </div>
    );
  }
  return (
    <div role="alert" className="rounded-[14px] border border-border/60 bg-muted/30 px-4 py-3 text-sm text-foreground">
      Taking longer than usual.{" "}
      <button type="button" onClick={retry} className="underline underline-offset-2 hover:text-primary">
        Resync
      </button>{" "}
      or email{" "}
      <a className="underline underline-offset-2 hover:text-primary" href="mailto:hello@pseolint.dev">
        hello@pseolint.dev
      </a>
      ; you won&apos;t be charged twice.
    </div>
  );
}
