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

/**
 * OpenPanel models revenue as a reserved `revenue` event carrying `__revenue`,
 * so it lands in the same stream as every other event and can be broken down
 * by any property or global. `amount` is in MAJOR currency units (dollars, not
 * cents): convert at the call site, where the provider's unit is known.
 *
 * There is deliberately no `aliasRaw`. `OpenPanel.alias()` is an empty function
 * body in @openpanel/sdk (verified in 1.3.1), so an alias call is dead code
 * that reads like working identity stitching. Anonymous history attaches to the
 * account via `identify()` on the same device instead.
 */
export async function revenueRaw(
  amount: number,
  properties: Record<string, unknown>,
  profileId?: string,
): Promise<void> {
  const op = getAnalyticsClient();
  if (!op) return;
  try {
    await Promise.resolve(op.revenue(amount, { ...properties, ...(profileId ? { profileId } : {}) }));
  } catch {
    /* swallow */
  }
}
