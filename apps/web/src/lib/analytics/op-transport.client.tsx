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
  // When self-hosted (apiUrl set), load the SDK script from the same instance
  // too — not openpanel.dev's CDN. This keeps analytics genuinely first-party
  // (what /privacy promises) and satisfies a self-only CSP. The self-hosted
  // OpenPanel serves the web script at `/op1.js`.
  return (
    <OpenPanelComponent
      clientId={clientId}
      {...(apiUrl ? { apiUrl, scriptUrl: `${apiUrl.replace(/\/$/, "")}/op1.js` } : {})}
      {...(profileId ? { profileId } : {})}
      trackScreenViews
      trackOutgoingLinks
    />
  );
}
