import "server-only";
import { after } from "next/server";
import { trackRaw, identifyRaw, aliasRaw } from "./op-transport.server";
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

export function aliasServer(payload: { profileId: string; alias: string }): Promise<void> {
  return aliasRaw(payload);
}
