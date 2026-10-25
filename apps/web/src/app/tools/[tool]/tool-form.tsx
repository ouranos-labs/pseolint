"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeUserUrl } from "@/lib/normalize-url";
import { type MarketingTool } from "@/lib/marketing-tools";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { AuditErrorNotice } from "@/components/audit/audit-error-notice";
import { TurnstileSlot, useTurnstile } from "@/components/audit/turnstile";
import { submitAudit } from "@/lib/audit-submit";
import {
  botCheckFailedView,
  botCheckPendingView,
  confirmAuthorizationView,
  invalidUrlView,
  type AuditErrorView,
} from "@/lib/audit-errors";

const TOS_STORAGE_KEY = "pseolint:audit-authorized-v1";

type ToolFormProps = {
  tool: MarketingTool;
};

export function ToolForm({ tool }: ToolFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { track } = useAnalytics();

  const [url, setUrl] = useState<string>(searchParams.get("url") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<AuditErrorView | null>(null);
  const [authorized, setAuthorized] = useState(false);
  // True only when authorization was restored from localStorage on mount (a
  // returning user): used to hide the checkbox entirely for them.
  const [rememberedAuthorization, setRememberedAuthorization] = useState(false);
  // Turnstile is deferred until the user engages the form (focuses the URL
  // field, or arrives with a prefilled URL) so the ~65px widget stays out of
  // first paint and the CTA sits right under the input.
  const [turnstileArmed, setTurnstileArmed] = useState<boolean>(
    Boolean(searchParams.get("url")),
  );

  // Re-sync prefill when query param changes (Next router doesn't remount).
  useEffect(() => {
    const q = searchParams.get("url");
    if (q && !url) {
      setUrl(q);
      setTurnstileArmed(true);
    }
    // intentionally only on mount-equivalent search-params change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(TOS_STORAGE_KEY) === "1") {
        setAuthorized(true);
        setRememberedAuthorization(true);
      }
    } catch {
      // localStorage unavailable: checkbox stays visible and unchecked.
    }
  }, []);

  const onAuthorizedChange = (checked: boolean): void => {
    setAuthorized(checked);
    try {
      if (checked) window.localStorage.setItem(TOS_STORAGE_KEY, "1");
      else window.localStorage.removeItem(TOS_STORAGE_KEY);
    } catch {
      // localStorage write failed: non-fatal, the in-memory state still gates submit.
    }
  };

  const ts = useTurnstile({ elementId: "turnstile-widget-tool", armed: turnstileArmed });

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const normalized = normalizeUserUrl(url);
    if (!normalized) {
      setErr(invalidUrlView());
      return;
    }
    if (!authorized) {
      setErr(confirmAuthorizationView());
      return;
    }
    // Defensive: arm Turnstile if a focus-less path (autofill + Enter) reached
    // submit; this submit still falls through to the token guard below.
    if (!turnstileArmed) setTurnstileArmed(true);
    if (!ts.token) {
      setErr(ts.status === "error" || ts.status === "unconfigured" ? botCheckFailedView() : botCheckPendingView());
      return;
    }
    setSubmitting(true);
    setErr(null);
    const result = await submitAudit(
      { url: normalized, turnstileToken: ts.token, tool: tool.slug },
      { returnTo: `/tools/${tool.slug}?url=${encodeURIComponent(normalized)}` },
    );
    if (result.ok) {
      track({ name: "tool_run", props: { tool: tool.slug } });
      router.push(result.next);
      return;
    }
    ts.reset();
    setErr(result.view);
    setSubmitting(false);
  };

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor={`url-${tool.slug}`} className="sr-only">
          Site URL
        </label>
        <Input
          id={`url-${tool.slug}`}
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onFocus={() => setTurnstileArmed(true)}
          onBlur={() => {
            const n = normalizeUserUrl(url);
            if (n) setUrl(n);
          }}
          placeholder="yoursite.com"
          className="h-11"
        />

        {!rememberedAuthorization && (
          <label className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => onAuthorizedChange(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border-strong"
              aria-label="Confirm authorization to audit"
            />
            <span>
              I&apos;m authorized to audit this URL (it&apos;s mine, or I have the owner&apos;s
              permission). Audits respect <code className="font-mono text-[10px]">robots.txt</code>.
            </span>
          </label>
        )}

        <TurnstileSlot ts={ts} />

        <Button type="submit" disabled={submitting || err?.cooldownUntil != null} className="h-11 w-full font-semibold">
          {submitting ? "Starting audit…" : `Run ${tool.primaryKeyword}, free`}
        </Button>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          We fetch up to 50 pages over a few minutes. Anonymous reports stay live for 24 hours.
        </p>

        {err && <AuditErrorNotice view={err} onCooldownEnd={() => setErr(null)} />}
      </form>
    </>
  );
}
