import "server-only";
import { after } from "next/server";
import { trackRaw, identifyRaw, revenueRaw } from "./op-transport.server";
import { toTrackArgs, type AnalyticsEvent } from "./events";

/** Typed server-side tracking. App glue binding the catalog to the transport. */
export function trackServer(event: AnalyticsEvent, opts: { profileId?: string } = {}): Promise<void> {
  const [name, props] = toTrackArgs(event);
  return trackRaw(name, props, opts.profileId);
}

/**
 * Fire-and-forget server tracking for request handlers. Uses next/server
 * `after()` so the tracking POST never adds latency to the response. `after()`
 * throws when called outside a request scope (e.g. a route handler invoked
 * directly from a unit test), so fall back to a detached call there.
 */
export function trackServerAfter(event: AnalyticsEvent, opts: { profileId?: string } = {}): void {
  const run = (): void => { void trackServer(event, opts); };
  try {
    after(run);
  } catch {
    run();
  }
}

export function identifyServer(payload: {
  profileId: string;
  email?: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  return identifyRaw(payload);
}

/** Amount in major currency units (dollars), not cents. */
export function revenueServer(
  amount: number,
  properties: Record<string, unknown>,
  opts: { profileId?: string } = {},
): Promise<void> {
  return revenueRaw(amount, properties, opts.profileId);
}
