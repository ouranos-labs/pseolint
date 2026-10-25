"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";

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

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady";

export type TurnstileStatus = "unconfigured" | "loading" | "ready" | "error";

export type TurnstileController = {
  elementId: string;
  armed: boolean;
  siteKey: string | undefined;
  token: string | null;
  status: TurnstileStatus;
  /** Discard the (single-use) token and run a fresh challenge. Call after EVERY non-OK submit. */
  reset: () => void;
  /** In-place recovery after a load/challenge error: no page reload, the typed URL survives. */
  retry: () => void;
  scriptSrc: string;
  onScriptError: () => void;
};

/**
 * Cloudflare Turnstile for the audit forms. A token is single-use: once the
 * server has verified it (accepted OR rejected), resubmitting it fails, which
 * is why every non-OK response must call `reset()`; skipping that is what made
 * every retry fail "Bot check failed".
 *
 * `armed` defers rendering until the user engages the form, keeping the widget
 * out of first paint.
 */
export function useTurnstile({ elementId, armed }: { elementId: string; armed: boolean }): TurnstileController {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<TurnstileStatus>(siteKey ? "loading" : "unconfigured");
  // Bumped to re-run the render effect (widget removed or never rendered).
  const [renderAttempt, setRenderAttempt] = useState(0);
  // Bumped to reload the script itself when it failed to load at all.
  const [scriptAttempt, setScriptAttempt] = useState(0);
  const widgetIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!siteKey || !armed) return;

    const render = (): void => {
      if (!window.turnstile) return;
      const el = document.getElementById(elementId);
      if (!el || el.childElementCount > 0) return;
      try {
        widgetIdRef.current = window.turnstile.render(el, {
          sitekey: siteKey,
          callback: (t) => {
            setToken(t);
            setStatus("ready");
          },
          "expired-callback": () => {
            setToken(null);
            setStatus("loading");
          },
          "error-callback": () => {
            setToken(null);
            setStatus("error");
          },
        });
      } catch {
        setStatus("error");
      }
    };

    setStatus("loading");
    if (window.turnstile) render();
    else window.onTurnstileReady = render;

    return () => {
      window.onTurnstileReady = undefined;
      const id = widgetIdRef.current;
      widgetIdRef.current = undefined;
      if (id !== undefined && window.turnstile?.remove) {
        try {
          window.turnstile.remove(id);
        } catch {
          // Widget already removed by a prior unmount: safe to ignore.
        }
      }
    };
  }, [siteKey, armed, elementId, renderAttempt, scriptAttempt]);

  const reset = useCallback((): void => {
    setToken(null);
    if (!siteKey) return;
    setStatus("loading");
    const id = widgetIdRef.current;
    if (id !== undefined && window.turnstile) {
      try {
        window.turnstile.reset(id);
        return;
      } catch {
        // fall through to a fresh render
      }
    }
    if (window.turnstile) setRenderAttempt((n) => n + 1);
    // The script never loaded (blocked, offline): load it again.
    else setScriptAttempt((n) => n + 1);
  }, [siteKey]);

  return {
    elementId,
    armed,
    siteKey,
    token,
    status,
    reset,
    retry: reset,
    scriptSrc: scriptAttempt > 0 ? `${SCRIPT_SRC}&retry=${scriptAttempt}` : SCRIPT_SRC,
    onScriptError: () => setStatus("error"),
  };
}

/** Script + widget mount + one status line. Renders nothing until armed. */
export function TurnstileSlot({ ts }: { ts: TurnstileController }) {
  if (ts.status === "unconfigured") {
    // Developer guidance stays in development builds only.
    return process.env.NODE_ENV !== "production" ? (
      <p className="rounded-[12px] border border-warning/40 bg-warning/5 p-2 text-xs text-warning">
        Turnstile isn&apos;t configured. Set <code className="font-mono">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> in .env.local.
      </p>
    ) : (
      <p className="text-xs text-muted-foreground">Bot check couldn&apos;t load. Refresh the page to try again.</p>
    );
  }
  if (!ts.armed) return null;
  return (
    <>
      <Script key={ts.scriptSrc} src={ts.scriptSrc} async defer onError={ts.onScriptError} />
      <div className="relative">
        <div id={ts.elementId} />
        {ts.status === "loading" && (
          <p className="mt-1 text-xs text-muted-foreground">Running a quick bot check…</p>
        )}
        {ts.status === "error" && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
            Bot check couldn&apos;t load.
            <button type="button" onClick={ts.retry} className="font-medium text-primary hover:underline">
              Retry
            </button>
          </p>
        )}
      </div>
    </>
  );
}
