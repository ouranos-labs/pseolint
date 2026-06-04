"use client";

import React, { useState, useTransition, useEffect } from "react";
import { getIndexingUsageAction } from "@/app/dashboard/indexing-actions";
import { updateIndexNowKeyAction } from "@/app/dashboard/[host]/settings/actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Info, Copy } from "lucide-react";

interface IndexNowDomainFormProps {
  domainHost: string;
  initialKey?: string;
}

export function IndexNowDomainForm({
  domainHost,
  initialKey = "",
}: IndexNowDomainFormProps) {
  const [pending, start] = useTransition();
  const [indexNowKey, setIndexNowKey] = useState(initialKey);
  const [isCopied, setIsCopied] = useState(false);

  // Quota tracking
  const [quota, setQuota] = useState<{ indexNowCount: number } | null>(null);

  useEffect(() => {
    async function loadQuota() {
      try {
        const res = await getIndexingUsageAction();
        setQuota({ indexNowCount: res.indexNowCount });
      } catch (err) {
        console.error("Failed to load quota:", err);
      }
    }
    loadQuota();
  }, []);

  const handleIndexNowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!indexNowKey.trim()) {
      toast.error("Please enter your IndexNow API key.");
      return;
    }

    start(async () => {
      try {
        const formData = new FormData();
        formData.append("domainHost", domainHost);
        formData.append("indexNowKey", indexNowKey);
        await updateIndexNowKeyAction(formData);
        toast.success("IndexNow credentials saved successfully!");
      } catch (err: any) {
        toast.error(err.message || "Failed to save IndexNow credentials.");
      }
    });
  };

  const handleDisconnect = () => {
    if (!confirm(`Are you sure you want to remove the IndexNow key?`)) {
      return;
    }

    start(async () => {
      try {
        const formData = new FormData();
        formData.append("domainHost", domainHost);
        formData.append("indexNowKey", ""); // empty clears it
        await updateIndexNowKeyAction(formData);
        setIndexNowKey("");
        toast.success("IndexNow key removed successfully!");
      } catch (err: any) {
        toast.error(err.message || "Failed to remove IndexNow key.");
      }
    });
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  const isConnected = !!initialKey && initialKey === indexNowKey;

  if (isConnected) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        {/* Connected Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
            <span className="font-semibold text-success">Active & Integrated</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={handleDisconnect}
            className="h-8 rounded-[12px] text-xs font-mono border border-destructive/30 hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
          >
            Remove Key
          </Button>
        </div>

        {/* IndexNow Connected Details */}
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 font-mono text-[11px] bg-background/50 border border-border/40 p-3 rounded-[12px] text-muted-foreground">
            <div className="flex justify-between">
              <span>API Key:</span>
              <span className="text-foreground font-semibold">
                {indexNowKey.slice(0, 8)}...{indexNowKey.slice(-8)}
              </span>
            </div>
          </div>

          {/* IndexNow Verification Setup Required */}
          <div className="rounded-[14px] border border-border bg-background/30 p-4 text-xs">
            <div className="flex items-center gap-1.5">
              <Info className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">IndexNow Verification Check</span>
            </div>
            <p className="mt-2 text-muted-foreground leading-relaxed">
              To authorize crawlers like Bing, you must serve a text file containing the key at your site's root:
            </p>
            <div className="mt-3 grid gap-2 font-mono text-[11px] bg-background border border-border p-3 rounded-[12px]">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-sans">Verification Path</span>
                <span className="text-foreground select-all">https://{domainHost}/{indexNowKey}.txt</span>
              </div>
              <div className="flex flex-col gap-0.5 border-t border-border/50 pt-2">
                <span className="text-[10px] text-muted-foreground uppercase font-sans">File Content</span>
                <div className="flex items-center justify-between">
                  <span className="text-foreground select-all break-all">{indexNowKey}</span>
                  <button
                    type="button"
                    onClick={() => copyText(indexNowKey)}
                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-sans ml-2 shrink-0"
                  >
                    {isCopied ? "Copied ✓" : <><Copy className="h-3 w-3" /> Copy</>}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* IndexNow Quota Display */}
          {quota && (
            <div className="rounded-[14px] border border-border bg-background/30 p-4">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">IndexNow Pushes (Last 24h)</span>
                <span className="font-mono text-foreground font-semibold">
                  {quota.indexNowCount} <span className="text-muted-foreground">URLs</span>
                </span>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground leading-normal">
                IndexNow has no strict daily rate limits for valid verified domains.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // IndexNow Form
  return (
    <form onSubmit={handleIndexNowSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          IndexNow API Key
        </label>
        <Input
          type="text"
          value={indexNowKey}
          onChange={(e) => setIndexNowKey(e.target.value)}
          disabled={pending}
          placeholder="e.g. 499c39fb0ac1413f9551daa4facf8abd"
          className="font-mono text-xs w-full sm:max-w-md"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={pending} className="w-full sm:w-fit font-mono text-xs">
          {pending ? "Saving..." : "Save Credentials"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          IndexNow instantly indexes URLs with Bing, Yandex, Seznam, Naver. Key must match the verification file hosted on
          your origin.
        </p>
      </div>
    </form>
  );
}
