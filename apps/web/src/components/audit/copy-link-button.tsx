"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function CopyLinkButton({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-[18px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary",
        className,
      )}
      aria-live="polite"
    >
      <span aria-hidden>{copied ? "✓" : "↗"}</span>
      {copied ? "Link copied" : "Copy share link"}
    </button>
  );
}
