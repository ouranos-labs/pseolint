"use client";
import { OpenPanelComponent } from "@openpanel/nextjs";

/**
 * Generic OpenPanel client transport — portable, no pseolint event names.
 * Renders nothing when unconfigured. trackScreenViews emits pageviews
 * automatically; trackOutgoingLinks emits outbound-link clicks.
 */
export function AnalyticsProvider({
  clientId,
  apiUrl,
  profileId,
}: {
  clientId?: string;
  apiUrl?: string;
  profileId?: string;
}) {
  if (!clientId) return null;
  return (
    <OpenPanelComponent
      clientId={clientId}
      {...(apiUrl ? { apiUrl } : {})}
      {...(profileId ? { profileId } : {})}
      trackScreenViews
      trackOutgoingLinks
    />
  );
}
