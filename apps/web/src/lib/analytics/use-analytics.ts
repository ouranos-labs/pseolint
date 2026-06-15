"use client";
import { useOpenPanel } from "@openpanel/nextjs";
import { toTrackArgs, type AnalyticsEvent } from "./events";

/** Typed client tracking. The provider sets profileId globally, so callers
 *  only pass the event. */
export function useAnalytics(): { track: (event: AnalyticsEvent) => void } {
  const op = useOpenPanel();
  return {
    track: (event) => {
      const [name, props] = toTrackArgs(event);
      op.track(name, props);
    },
  };
}
