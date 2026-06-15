"use client";
import { useAnalytics } from "@/lib/analytics/use-analytics";

/** Fires integration_connect_clicked before navigating to the GSC OAuth flow. */
export function GscConnectButton() {
  const { track } = useAnalytics();
  return (
    <a
      href="/api/integrations/gsc/connect"
      onClick={() => track({ name: "integration_connect_clicked", props: { provider: "gsc" } })}
      className="inline-flex w-fit items-center rounded-[14px] border border-border-strong bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
    >
      Connect with Google
    </a>
  );
}
