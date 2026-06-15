"use client";
import { useEffect, useRef } from "react";
import { useAnalytics } from "./use-analytics";
import type { AnalyticsEvent } from "./events";

/** Render-nothing helper: fires one event on mount. Lets server pages emit a
 *  typed view event without a bespoke client island. */
export function TrackView({ event }: { event: AnalyticsEvent }) {
  const { track } = useAnalytics();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event);
    // Fire once on mount; event identity intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
