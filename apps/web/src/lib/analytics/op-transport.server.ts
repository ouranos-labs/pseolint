import "server-only";
import { OpenPanel } from "@openpanel/sdk";
import { env } from "@/lib/env";

/**
 * Generic OpenPanel server transport: no pseolint event names live here. This
 * is the file that lifts into a private `packages/analytics` when a second
 * apps/ app needs analytics (see spec §3.5). Lazy singleton so unconfigured
 * environments construct nothing.
 */
let client: OpenPanel | null | undefined;

export function getAnalyticsClient(): OpenPanel | null {
  if (client !== undefined) return client;
  const e = env();
  if (!e.OPENPANEL_CLIENT_ID || !e.OPENPANEL_CLIENT_SECRET) {
    client = null;
    return client;
  }
  client = new OpenPanel({
    clientId: e.OPENPANEL_CLIENT_ID,
    clientSecret: e.OPENPANEL_CLIENT_SECRET,
    ...(e.OPENPANEL_API_URL ? { apiUrl: e.OPENPANEL_API_URL } : {}),
  });
  return client;
}

/** Test-only: drop the memoized client so env changes take effect. */
export function __resetAnalyticsClient(): void {
  client = undefined;
}

export async function trackRaw(
  name: string,
  properties: Record<string, unknown>,
  profileId?: string,
): Promise<void> {
  const op = getAnalyticsClient();
  if (!op) return;
  try {
    await Promise.resolve(op.track(name, { ...properties, ...(profileId ? { profileId } : {}) }));
  } catch {
    /* analytics must never break a request */
  }
}

export async function identifyRaw(payload: {
  profileId: string;
  email?: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const op = getAnalyticsClient();
  if (!op) return;
  try {
    await Promise.resolve(op.identify(payload));
  } catch {
    /* swallow */
  }
}

export async function aliasRaw(payload: { profileId: string; alias: string }): Promise<void> {
  const op = getAnalyticsClient();
  if (!op) return;
  try {
    await Promise.resolve(op.alias(payload));
  } catch {
    /* swallow */
  }
}
