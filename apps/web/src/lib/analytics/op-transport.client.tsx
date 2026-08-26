"use client";
import { OpenPanelComponent } from "@openpanel/nextjs";

/**
 * Generic OpenPanel client transport: portable, no pseolint event names.
 * Renders nothing when unconfigured. trackScreenViews emits pageviews
 * automatically; trackOutgoingLinks emits outbound-link clicks.
 *
 * Both the script and events go through our same-origin proxy at `/api/op`
 * (see src/app/api/op/[...op]/route.ts), so analytics is genuinely first-party,
 * ad-blocker resistant, and needs no external CSP origin. The proxy forwards
 * to the self-hosted instance server-side.
 */
export function AnalyticsProvider({
  clientId,
  profileId,
  globalProperties,
}: {
  clientId?: string;
  profileId?: string;
  /** Merged into EVERY client event, including automatic pageviews. The server
   *  transport deliberately has no equivalent: its OpenPanel client is a
   *  module-level singleton shared by concurrent requests, so a global set for
   *  one visitor would leak onto another's events. Server events pass what they
   *  need per call instead. */
  globalProperties?: Record<string, unknown>;
}) {
  if (!clientId) return null;
  return (
    <OpenPanelComponent
      clientId={clientId}
      apiUrl="/api/op"
      scriptUrl="/api/op/op1.js"
      {...(profileId ? { profileId } : {})}
      {...(globalProperties ? { globalProperties } : {})}
      trackScreenViews
      trackOutgoingLinks
    />
  );
}
