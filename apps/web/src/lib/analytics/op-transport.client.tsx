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
}: {
  clientId?: string;
  profileId?: string;
}) {
  if (!clientId) return null;
  return (
    <OpenPanelComponent
      clientId={clientId}
      apiUrl="/api/op"
      scriptUrl="/api/op/op1.js"
      {...(profileId ? { profileId } : {})}
      trackScreenViews
      trackOutgoingLinks
    />
  );
}
