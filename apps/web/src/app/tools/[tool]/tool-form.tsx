"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeUserUrl } from "@/lib/normalize-url";
import { type MarketingTool } from "@/lib/marketing-tools";

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
  action?: { label: string; href: string };
};

type AuditResponse = {
  auditId?: string;
  reportUrl?: string;
  cached?: boolean;
};

const TOS_STORAGE_KEY = "pseolint:audit-authorized-v1";

type ToolFormProps = {
  tool: MarketingTool;
};

export function ToolForm({ tool }: ToolFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const [url, setUrl] = useState<string>(searchParams.get("url") ?? "");
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<FormError | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [tosGateShown, setTosGateShown] = useState(false);

  // Re-sync prefill when query param changes (Next router doesn't remount).
  useEffect(() => {
    const q = searchParams.get("url");
    if (q && !url) setUrl(q);
    // intentionally only on mount-equivalent search-params change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(TOS_STORAGE_KEY) === "1") {
        setAuthorized(true);
      }
    } catch {
      // localStorage unavailable — fall back to the submit-time gate.
    }
  }, []);

  const onAuthorizedChange = (checked: boolean): void => {
    setAuthorized(checked);
    try {
      if (checked) window.localStorage.setItem(TOS_STORAGE_KEY, "1");
      else window.localStorage.removeItem(TOS_STORAGE_KEY);
    } catch {
      // localStorage write failed — non-fatal, the in-memory state still gates submit.
    }
  };

  // Mirror the homepage Turnstile mount: render via the script's onload
  // callback so we never poll for window.turnstile. Handle both ordering paths
  // (callback before or after this effect) and clean the widget up on unmount.
  useEffect(() => {
    if (!siteKey) return;
    let widgetId: string | undefined;

    const render = (): void => {
      if (!window.turnstile) return;
      const el = document.getElementById("turnstile-widget-tool");
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
          // Widget already removed by a prior unmount — safe to ignore.
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
        hint: "Use a full URL starting with https:// — e.g. https://yoursite.com.",
      });
      return;
    }
    if (!authorized) {
      setTosGateShown(true);
      setErr({
        message: "Please confirm you're authorized to audit this URL.",
        hint: "Tick the authorization box below the URL input. We only check it once.",
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
        body: JSON.stringify({ url: normalized, turnstileToken: token }),
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
      const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
      setErr(mapApiError(res.status, String(body.error ?? "Unknown error")));
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
          onBlur={() => {
            const n = normalizeUserUrl(url);
            if (n) setUrl(n);
          }}
          placeholder="yoursite.com"
          className="h-11"
        />

        {tosGateShown && (
          <label className="flex items-start gap-2 rounded-[14px] border border-border/60 bg-card/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => onAuthorizedChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong"
              aria-label="Confirm authorization to audit"
            />
            <span>
              I have authorization to audit the URL above (it&apos;s mine, or I have the owner&apos;s
              permission). Audits respect <code className="font-mono text-[10px]">robots.txt</code>{" "}
              by default.
            </span>
          </label>
        )}

        <div className="relative">
          <div id="turnstile-widget-tool" />
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
          {submitting ? "Starting audit…" : `Run ${tool.primaryKeyword} — free`}
        </Button>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          We fetch up to 50 pages over a few minutes. Anonymous reports stay live for 24 hours.
        </p>

        {err && (
          <div className="rounded-[14px] border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="text-destructive">{err.message}</p>
            {err.hint && <p className="mt-1 text-xs text-muted-foreground">{err.hint}</p>}
            {err.action && (
              <Link
                href={err.action.href}
                className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
              >
                {err.action.label} →
              </Link>
            )}
          </div>
        )}
      </form>
    </>
  );
}

function mapApiError(status: number, message: string): FormError {
  const lower = message.toLowerCase();
  if (status === 429) {
    if (lower.includes("session limit")) {
      return {
        message: "You've used your 3 free audits for this session today.",
        hint: "Sign in (free) for 5 per day + 30-day report retention.",
        action: { label: "Sign in", href: "/signin" },
      };
    }
    if (lower.includes("domain")) {
      return {
        message: "This domain has already been audited a few times today.",
        hint: "Try again tomorrow, or Pro for unlimited re-audits.",
        action: { label: "See pricing", href: "/pricing" },
      };
    }
    if (lower.includes("daily")) {
      return {
        message: "You've hit today's free audit limit (5 per day).",
        hint: "Pro lifts it to 50 per day and unlocks 500-page manual re-audits.",
        action: { label: "See pricing", href: "/pricing" },
      };
    }
    return { message };
  }
  if (status === 400) {
    if (lower.includes("bot check")) {
      return {
        message: "Bot check failed. Try again.",
        hint: "Refresh the page if the Turnstile widget didn't solve automatically.",
      };
    }
    if (lower.includes("private") || lower.includes("loopback") || lower.includes("not allowed")) {
      return {
        message: "Can't audit that URL.",
        hint: "We only audit public sites — localhost, private networks, and non-http(s) URLs are blocked.",
      };
    }
    return { message: "That URL couldn't be processed.", hint: message };
  }
  if (status === 503) {
    return { message: "New audits are paused.", hint: message };
  }
  return { message };
}
