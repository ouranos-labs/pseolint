"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeUserUrl } from "@/lib/normalize-url";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement | string,
        o: {
          sitekey: string;
          callback: (t: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
    onTurnstileReady?: () => void;
  }
}

type FormError = {
  message: string;
  hint?: string;
};

type AuditResponse = {
  auditId?: string;
  reportUrl?: string;
  cached?: boolean;
};

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
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const [url, setUrl] = useState<string>("");
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<FormError | null>(null);

  // Mirror the tool-form Turnstile mount: render via the script's onload
  // callback so we never poll for window.turnstile. Use a distinct DOM id from
  // tool-form's widget so both can co-render without colliding.
  useEffect(() => {
    if (!siteKey) return;
    let widgetId: string | undefined;

    const render = (): void => {
      if (!window.turnstile) return;
      const el = document.getElementById(INLINE_TURNSTILE_DOM_ID);
      if (!el || el.childElementCount > 0) return;
      widgetId = window.turnstile.render(el, {
        sitekey: siteKey,
        callback: (t) => setToken(t),
        "expired-callback": () => setToken(null),
        "error-callback": () => setToken(null),
      });
    };

    if (window.turnstile) render();
    else window.onTurnstileReady = render;

    return () => {
      window.onTurnstileReady = undefined;
      if (widgetId !== undefined && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // Widget already removed by a prior unmount: safe to ignore.
        }
      }
    };
  }, [siteKey]);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const normalized = normalizeUserUrl(url);
    if (!normalized) {
      setErr({
        message: "That doesn't look like a valid URL.",
        hint: "Use a full URL starting with https://, e.g. https://yoursite.com.",
      });
      return;
    }
    if (!token) {
      setErr({
        message: "Complete the bot check first.",
        hint: "The widget is just above the button. Refresh if it didn't load.",
      });
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: normalized, turnstileToken: token, ...(tool ? { tool } : {}) }),
      });
      if (res.ok) {
        const data = (await res.json()) as AuditResponse;
        const next =
          data.cached && data.reportUrl
            ? `${data.reportUrl}?cached=1`
            : data.auditId
              ? `/a/${data.auditId}`
              : data.reportUrl ?? "/";
        router.push(next);
        return;
      }
      const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as {
        error?: string;
      };
      setErr({ message: String(body.error ?? `Audit failed (${res.status})`) });
    } catch (fetchErr) {
      setErr({
        message: "Couldn't reach the server.",
        hint: (fetchErr as Error).message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady"
        async
        defer
      />

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

          <div className="relative">
            <div id={INLINE_TURNSTILE_DOM_ID} />
            {siteKey && !token && (
              <p className="mt-1 text-xs text-muted-foreground">
                Loading bot check… if this doesn&apos;t resolve in a few seconds, refresh the page.
              </p>
            )}
            {!siteKey && (
              <p className="rounded-[12px] border border-warning/40 bg-warning/5 p-2 text-xs text-warning">
                Turnstile isn&apos;t configured. Set{" "}
                <code className="font-mono">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> in .env.local.
              </p>
            )}
          </div>

          <Button type="submit" disabled={submitting} className="h-11 w-full font-semibold">
            {submitting ? "Starting audit…" : cta}
          </Button>

          {ruleHint && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">{ruleHint}</p>
          )}

          {err && (
            <div className="rounded-[14px] border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="text-destructive">{err.message}</p>
              {err.hint && <p className="mt-1 text-xs text-muted-foreground">{err.hint}</p>}
            </div>
          )}
        </form>
      </div>
    </>
  );
}
