"use client";

import { useTransition } from "react";
import { requestIndexingAction } from "@/app/dashboard/indexing-actions";
import { GOOGLE_INDEXING_ENABLED } from "@/lib/flags";
import { toast } from "sonner";

interface IndexingButtonProps {
  domainId: string;
  url: string;
  provider: "google" | "indexnow";
  latestAuditRisk: number | null;
  disabled?: boolean;
  recentStatus?: "pending" | "completed" | "failed" | null;
  recentError?: string | null;
  alreadyIndexed?: boolean;
}

export function IndexingButton({ 
  domainId,
  url,
  provider,
  latestAuditRisk,
  disabled,
  recentStatus,
  recentError,
  alreadyIndexed
}: IndexingButtonProps) {
  const [pending, start] = useTransition();

  // Google submission is "Coming soon" until re-enabled via the feature flag.
  const googleGated = provider === "google" && !GOOGLE_INDEXING_ENABLED;

  // v0.6 Quality Gate: Risk > 40 is too concerning to request indexing.
  const isRisky = latestAuditRisk !== null && latestAuditRisk > 40;

  const handleRequest = () => {
    if (googleGated) return;

    if (isRisky) {
      toast.error("Quality Gate: Audit risk is too high. Fix findings before requesting indexation.");
      return;
    }

    if (alreadyIndexed) {
      toast.error("Correlation Guard: This URL is already indexed (active impressions detected in GSC).");
      return;
    }

    start(async () => {
      const res = await requestIndexingAction({ domainId, url, provider });
      if (res.success) {
        toast.success(`Indexing requested via ${provider === "google" ? "Google" : "IndexNow"}`);
      } else {
        toast.error(res.error || "Failed to request indexing");
      }
    });
  };

  const providerLabel = provider === "google" ? "Google" : "IndexNow";
  
  let label = `Push to ${providerLabel}`;
  let themeClass = "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/50 hover:text-primary";
  let titleText = isRisky 
    ? "Audit risk too high (fix issues first)" 
    : `Notify ${providerLabel} about this URL`;

  if (googleGated) {
    label = `Google · Soon`;
    themeClass = "border-border/40 bg-card/20 text-muted-foreground/60 pointer-events-none cursor-default opacity-70";
    titleText = "Direct Google submission is coming soon: use IndexNow + sitemaps for now";
  } else if (alreadyIndexed) {
    label = `Indexed ✓`;
    themeClass = "border-success/30 bg-success/5 text-success/80 pointer-events-none cursor-default opacity-85";
    titleText = `This URL is already indexed (active search impressions detected in Google Search Console)`;
  } else if (pending) {
    label = "Pushing...";
  } else if (recentStatus === "completed") {
    label = `${providerLabel} ✓`;
    themeClass = "border-success/30 bg-success/5 text-success/80 pointer-events-none cursor-default opacity-85";
    titleText = `Successfully requested indexing via ${providerLabel}`;
  } else if (recentStatus === "failed") {
    label = `Retry ${providerLabel} ⚠`;
    themeClass = "border-warning/40 bg-warning/5 text-warning hover:border-primary/50 hover:bg-primary/5 hover:text-primary";
    titleText = `Last attempt failed: ${recentError || "Unknown error"}. Click to retry.`;
  }

  return (
    <button
      type="button"
      disabled={pending || disabled || googleGated || recentStatus === "completed" || alreadyIndexed}
      onClick={handleRequest}
      className={`rounded-[10px] border px-2.5 py-1 font-mono text-[11px] transition-colors disabled:opacity-50 ${themeClass}`}
      title={titleText}
    >
      {label}
    </button>
  );
}

