"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeUserUrl } from "@/lib/normalize-url";
import { AuditErrorNotice } from "@/components/audit/audit-error-notice";
import { TurnstileSlot, useTurnstile } from "@/components/audit/turnstile";
import { submitAudit } from "@/lib/audit-submit";
import { botCheckFailedView, botCheckPendingView, invalidUrlView, type AuditErrorView } from "@/lib/audit-errors";

const INLINE_TURNSTILE_DOM_ID = "inline-turnstile-widget";

export type InlineAuditWidgetProps = {
  headline: string;
  cta: string;
  ruleHint?: string;
  /**
   * Optional tool slug. When set, it's sent to POST /api/audits so the report
   * renders a FocusedLensCard scoped to that tool's ruleLens: the only way to
   * deliver a "focused on X" promise. Omit it for a plain full audit.
   */
  tool?: string;
};

export function InlineAuditWidget({
  headline,
  cta,
  ruleHint,
  tool,
}: InlineAuditWidgetProps): React.JSX.Element {
  const router = useRouter();
  const [url, setUrl] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<AuditErrorView | null>(null);
  // This widget sits inside long-form marketing content and loads its check
  // up front, so it is armed from mount.
  const ts = useTurnstile({ elementId: INLINE_TURNSTILE_DOM_ID, armed: true });

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const normalized = normalizeUserUrl(url);
    if (!normalized) {
      setErr(invalidUrlView());
      return;
    }
    if (!ts.token) {
      setErr(ts.status === "error" || ts.status === "unconfigured" ? botCheckFailedView() : botCheckPendingView());
      return;
    }
    setSubmitting(true);
    setErr(null);
    const result = await submitAudit(
      { url: normalized, turnstileToken: ts.token, ...(tool ? { tool } : {}) },
      { returnTo: `/?prefill=${encodeURIComponent(normalized)}` },
    );
    if (result.ok) {
      router.push(result.next);
      return;
    }
    ts.reset();
    setErr(result.view);
    setSubmitting(false);
  };

  return (
    <>
      <div className="rounded-[18px] border border-border/60 bg-card/40 p-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{headline}</h3>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <label htmlFor="inline-audit-url" className="sr-only">
            Site URL
          </label>
          <Input
            id="inline-audit-url"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => {
              const n = normalizeUserUrl(url);
              if (n) setUrl(n);
            }}
            placeholder="yoursite.com"
            className="h-11"
          />

          <TurnstileSlot ts={ts} />

          <Button type="submit" disabled={submitting || err?.cooldownUntil != null} className="h-11 w-full font-semibold">
            {submitting ? "Starting audit…" : cta}
          </Button>

          {ruleHint && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">{ruleHint}</p>
          )}

          {err && <AuditErrorNotice view={err} onCooldownEnd={() => setErr(null)} />}
        </form>
      </div>
    </>
  );
}
