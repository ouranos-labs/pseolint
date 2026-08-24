"use client";

import { useRef, useState, useTransition, useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestIndexingAction, requestBatchIndexingAction } from "@/app/dashboard/indexing-actions";
import { normalizeUserUrl } from "@/lib/normalize-url";
import { GOOGLE_INDEXING_ENABLED } from "@/lib/flags";
import { toast } from "sonner";

interface IndexingRequest {
  url: string;
  provider: "google" | "indexnow";
  status: "pending" | "completed" | "failed";
  error: string | null;
}

interface QuickIndexerCardProps {
  domainId: string;
  host: string;
  latestAuditRisk: number | null;
  indexingIntegrations: ("google-indexing" | "indexnow")[];
  recentIndexingRequests?: IndexingRequest[];
  indexedUrls?: string[];
  /** Server-derived clean pages: observed by the engine, zero open findings, not yet indexed. */
  cleanCandidateUrls?: string[];
}

function pathOf(url: string) {
  try { return new URL(url).pathname || url; } catch { return url; }
}

// ─── Provider Toggle ────────────────────────────────────────────────────────

function ProviderToggle({
  provider,
  onChange,
  hasGoogle,
  hasIndexNow,
  googleEnabled,
  disabled,
}: {
  provider: "google" | "indexnow";
  onChange: (p: "google" | "indexnow") => void;
  hasGoogle: boolean;
  hasIndexNow: boolean;
  googleEnabled: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        via
      </span>
      <div className="flex gap-1">
        {hasGoogle && (
          <button
            type="button"
            onClick={() => googleEnabled && onChange("google")}
            disabled={disabled || !googleEnabled}
            title={googleEnabled ? undefined : "Direct Google submission is coming soon, use IndexNow + sitemaps for now"}
            className={`flex items-center gap-1 rounded-[8px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              !googleEnabled
                ? "cursor-default border-border/30 bg-card/10 text-muted-foreground/50"
                : provider === "google"
                ? "border-primary/60 bg-primary/5 text-primary font-semibold"
                : "border-border/40 bg-card/20 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            Google API
            {!googleEnabled && (
              <span className="rounded-[4px] bg-muted/40 px-1 text-[8px] font-semibold text-muted-foreground/70">
                soon
              </span>
            )}
          </button>
        )}
        {hasIndexNow && (
          <button
            type="button"
            onClick={() => onChange("indexnow")}
            disabled={disabled}
            className={`rounded-[8px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              provider === "indexnow"
                ? "border-primary/60 bg-primary/5 text-primary font-semibold"
                : "border-border/40 bg-card/20 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            IndexNow
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Clean Page Row ──────────────────────────────────────────────────────────

function CleanPageRow({
  url,
  selected,
  onToggle,
  recentStatus,
  disabled,
}: {
  url: string;
  selected: boolean;
  onToggle: () => void;
  recentStatus?: "pending" | "completed" | "failed" | null;
  disabled: boolean;
}) {
  const isAlreadyPushed = recentStatus === "completed";

  return (
    <li
      className={`flex items-center gap-3 rounded-[10px] border px-3 py-2 transition-colors ${
        isAlreadyPushed
          ? "border-success/20 bg-success/5 opacity-70"
          : selected
          ? "border-primary/40 bg-primary/5"
          : "border-border/50 bg-card/30 hover:border-border/80"
      }`}
    >
      <input
        type="checkbox"
        checked={selected || isAlreadyPushed}
        onChange={onToggle}
        disabled={disabled || isAlreadyPushed}
        className="h-3.5 w-3.5 shrink-0 accent-primary"
        aria-label={`Select ${url}`}
      />
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground hover:text-primary"
        title={url}
      >
        {pathOf(url)}
      </a>
      {isAlreadyPushed && (
        <span className="shrink-0 font-mono text-[10px] text-success">Pushed ✓</span>
      )}
    </li>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function QuickIndexerCard({
  domainId,
  host,
  latestAuditRisk,
  indexingIntegrations,
  recentIndexingRequests = [],
  indexedUrls = [],
  cleanCandidateUrls = [],
}: QuickIndexerCardProps) {
  const [provider, setProvider] = useState<"google" | "indexnow">(
    GOOGLE_INDEXING_ENABLED ? "google" : "indexnow"
  );
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [batchPending, startBatch] = useTransition();

  // Custom URL state
  const [customUrl, setCustomUrl] = useState("");
  const [customPending, startCustom] = useTransition();
  const [showCustom, setShowCustom] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const customInputId = useId();

  const hasGoogle = indexingIntegrations.includes("google-indexing");
  const hasIndexNow = indexingIntegrations.includes("indexnow");

  // Auto-select IndexNow when Google is unconfigured or gated off ("Coming soon")
  useEffect(() => {
    if ((!hasGoogle || !GOOGLE_INDEXING_ENABLED) && hasIndexNow) setProvider("indexnow");
  }, [hasGoogle, hasIndexNow]);

  const isRisky = latestAuditRisk !== null && latestAuditRisk > 40;
  const integrationsConfigured = hasGoogle || hasIndexNow;

  // ── Selection helpers ────────────────────────────────────────────────────

  const eligibleUrls = cleanCandidateUrls.filter(
    (u) => recentIndexingRequests.find((r) => r.url === u && r.provider === provider && r.status === "completed") === undefined
  );

  const allSelected = eligibleUrls.length > 0 && eligibleUrls.every((u) => selectedUrls.has(u));

  function toggleUrl(url: string) {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(eligibleUrls));
    }
  }

  // ── Batch push ───────────────────────────────────────────────────────────

  function handleBatchPush() {
    if (isRisky) {
      toast.error("Quality Gate: Domain risk is too high. Fix critical findings first.");
      return;
    }
    const urls = Array.from(selectedUrls);
    if (urls.length === 0) return;

    startBatch(async () => {
      const res = await requestBatchIndexingAction({ domainId, urls, provider });
      if (res.success) {
        toast.success(`Pushed ${urls.length} clean URL${urls.length > 1 ? "s" : ""} via ${provider === "google" ? "Google Indexing API" : "IndexNow"}`);
        setSelectedUrls(new Set());
      } else {
        toast.error(res.error || "Batch indexing failed");
      }
    });
  }

  // ── Custom URL push ──────────────────────────────────────────────────────

  const normalizedCustom = customUrl.trim() ? (normalizeUserUrl(customUrl) || customUrl.trim()) : "";

  let customValidationError: string | null = null;
  let customValidationNote: string | null = null;

  if (isRisky) {
    customValidationError = `Domain risk too high (${latestAuditRisk}/100): fix findings first.`;
  } else if (normalizedCustom) {
    try {
      const urlHost = new URL(normalizedCustom).hostname.toLowerCase();
      if (urlHost !== host.toLowerCase() && !urlHost.endsWith("." + host.toLowerCase())) {
        customValidationError = `URL must belong to ${host}.`;
      }
    } catch {
      customValidationError = "Invalid URL format.";
    }
    if (!customValidationError) {
      if (indexedUrls.includes(normalizedCustom)) {
        customValidationNote = "Already indexed (active GSC impressions detected).";
      } else {
        const dup = recentIndexingRequests.find(
          (r) => r.url === normalizedCustom && r.provider === provider && r.status === "completed"
        );
        if (dup) customValidationNote = `Already pushed via ${provider === "google" ? "Google" : "IndexNow"} recently.`;
      }
    }
  }

  function handleCustomPush(e: React.FormEvent) {
    e.preventDefault();
    if (!normalizedCustom || customValidationError) return;
    if (indexedUrls.includes(normalizedCustom)) {
      toast.error("Correlation Guard: This URL is already indexed.");
      return;
    }
    startCustom(async () => {
      const res = await requestIndexingAction({ domainId, url: normalizedCustom, provider });
      if (res.success) {
        toast.success(`Pushed via ${provider === "google" ? "Google Indexing API" : "IndexNow"}`);
        setCustomUrl("");
      } else {
        toast.error(res.error || "Failed to request indexing");
      }
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (!integrationsConfigured) return null;

  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-border/60 bg-card/10 p-5 backdrop-blur-sm">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Instant Indexing Engine</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Clean pages discovered by the engine: no open findings, not yet indexed.
            Push them directly to crawlers without touching the findings list.
          </p>
        </div>
        <ProviderToggle
          provider={provider}
          onChange={setProvider}
          hasGoogle={hasGoogle}
          hasIndexNow={hasIndexNow}
          googleEnabled={GOOGLE_INDEXING_ENABLED}
          disabled={batchPending || customPending}
        />
      </header>

      {isRisky && (
        <div className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          ⚠️ Domain Quality Gate: risk score {latestAuditRisk}/100 exceeds threshold. Fix critical findings before requesting indexation.
        </div>
      )}

      {/* ── Discovered Clean Pages ─────────────────────────────────────── */}
      {cleanCandidateUrls.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border/50 bg-background/30 p-5 text-center">
          <p className="text-xs text-muted-foreground">
            No clean pages discovered yet. Once the audit engine finds pages with all
            findings resolved or dismissed, they will appear here ready for indexation.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Select-all + push bar */}
          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={batchPending || isRisky || eligibleUrls.length === 0}
                className="h-3.5 w-3.5 accent-primary"
              />
              {allSelected ? "Deselect all" : `Select all (${eligibleUrls.length})`}
            </label>
            <Button
              type="button"
              size="sm"
              disabled={selectedUrls.size === 0 || batchPending || isRisky}
              onClick={handleBatchPush}
              className="h-8 px-3 text-xs"
            >
              {batchPending
                ? "Pushing…"
                : `Push ${selectedUrls.size > 0 ? selectedUrls.size : ""} selected`}
            </Button>
          </div>

          {/* URL checklist */}
          <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
            {cleanCandidateUrls.map((url) => (
              <CleanPageRow
                key={url}
                url={url}
                selected={selectedUrls.has(url)}
                onToggle={() => toggleUrl(url)}
                recentStatus={
                  recentIndexingRequests.find(
                    (r) => r.url === url && r.provider === provider
                  )?.status
                }
                disabled={batchPending || isRisky}
              />
            ))}
          </ul>
        </div>
      )}

      {/* ── Custom URL (secondary / new pages not yet crawled) ─────────── */}
      <div className="border-t border-border/40 pt-3">
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          <span className={`transition-transform ${showCustom ? "rotate-90" : ""}`}>›</span>
          Push a custom URL
          <span className="text-muted-foreground/60">(for brand-new pages not yet crawled)</span>
        </button>

        {showCustom && (
          <form onSubmit={handleCustomPush} className="mt-3 flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                ref={inputRef}
                id={customInputId}
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder={`https://${host}/your-new-page`}
                disabled={customPending || isRisky}
                className="h-9 flex-1 font-mono text-xs"
              />
              <Button
                type="submit"
                size="sm"
                disabled={
                  customPending ||
                  !normalizedCustom ||
                  !!customValidationError ||
                  indexedUrls.includes(normalizedCustom)
                }
                className="h-9 sm:w-28"
              >
                {customPending ? "Pushing…" : "Push URL"}
              </Button>
            </div>
            {normalizedCustom && (
              <p
                role="status"
                aria-live="polite"
                className={`text-xs ${
                  customValidationError
                    ? "text-destructive"
                    : customValidationNote
                    ? "text-warning"
                    : "text-muted-foreground"
                }`}
              >
                {customValidationError ?? customValidationNote ?? `✓ Ready to push via ${provider === "google" ? "Google Indexing API" : "IndexNow"}`}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

