"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import type { AnalyticsEvent } from "@/lib/analytics/events";

/** A next/link that fires a typed event on click before navigating. */
export function TrackedLink({
  event,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { event: AnalyticsEvent }) {
  const { track } = useAnalytics();
  return (
    <Link
      {...props}
      onClick={(e) => {
        track(event);
        onClick?.(e);
      }}
    />
  );
}
