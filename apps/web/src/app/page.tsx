"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiveDemo } from "@/components/landing/live-demo";
import { TileGrid, type TileState } from "@/components/landing/tile-grid";
import { CliMarquee } from "@/components/landing/cli-marquee";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void }) => void;
    };
  }
}

type FormError = {
  message: string;
  hint?: string;
  action?: { label: string; href: string };
};

const DEV_MODE = process.env.NODE_ENV !== "production";

export default function Home() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<FormError | null>(null);
  const router = useRouter();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const [force, setForce] = useState(false);

  useEffect(() => {
    try {
      const params = new URL(window.location.href).searchParams;
      const prefill = params.get("prefill");
      if (prefill) setUrl(prefill);
      if (params.get("force") === "1") setForce(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (DEV_MODE || !siteKey) return;
    const iv = setInterval(() => {
      if (window.turnstile) {
        const el = document.getElementById("turnstile-widget");
        if (el && el.childElementCount === 0) {
          window.turnstile.render(el, { sitekey: siteKey, callback: setToken });
          clearInterval(iv);
        }
      }
    }, 100);
    return () => clearInterval(iv);
  }, [siteKey]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setErr({
        message: "That doesn't look like a valid URL.",
        hint: "Use a full URL starting with https:// — e.g. https://yoursite.com.",
      });
      return;
    }
    if (!token && !DEV_MODE) {
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
        body: JSON.stringify({
          url: normalized,
          turnstileToken: token ?? "dev-skip",
          ...(force ? { force: true } : {}),
        }),
      });
      if (res.ok) {
        const { auditId, reportUrl, cached } = await res.json();
        router.push(cached && reportUrl ? reportUrl : `/a/${auditId}`);
        return;
      }
      const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
      setErr(mapApiError(res.status, String(error ?? "Unknown error")));
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
      { !DEV_MODE && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      ) }

      <section className="relative">
        <div className="mx-auto max-w-5xl px-5 pb-16 pt-16 sm:pt-20">
          <div className="grid gap-10 md:grid-cols-2 md:gap-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-12">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                40+ SpamBrain + AEO rules · v0.3.0
              </div>

              <h1 className="text-balance text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">
                Most programmatic SEO is doorway-page gardening. SpamBrain agrees.
              </h1>

              <p className="text-base leading-relaxed text-muted-foreground">
                Paste your site. In 60 seconds, see how close to the line it is —
                across 40+ rules covering SpamBrain risk and Answer Engine
                Optimization (how citable your pages are to LLMs).
              </p>

              <form onSubmit={ submit } className="flex flex-col gap-3">
                <label htmlFor="url" className="sr-only">
                  Site URL
                </label>
                <Input
                  id="url"
                  type="url"
                  required
                  value={ url }
                  onChange={ (e) => setUrl(e.target.value) }
                  placeholder="https://yoursite.com"
                  className="h-11"
                />

                { DEV_MODE ? (
                  <p className="rounded-[12px] border border-warning/40 bg-warning/5 px-3 py-2 font-mono text-[11px] text-warning">
                    DEV · bot check skipped
                  </p>
                ) : (
                  <div className="relative">
                    <div id="turnstile-widget" />
                    { siteKey && !token && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Loading bot check… if this doesn&apos;t resolve in a few seconds, refresh the page.
                      </p>
                    ) }
                    { !siteKey && (
                      <p className="rounded-[12px] border border-warning/40 bg-warning/5 p-2 text-xs text-warning">
                        Turnstile isn&apos;t configured. Set <code className="font-mono">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> in .env.local.
                      </p>
                    ) }
                  </div>
                ) }

                <Button
                  type="submit"
                  disabled={ submitting }
                  className="h-11 w-full font-semibold"
                >
                  { submitting ? "Starting audit…" : "Audit my site — free" }
                </Button>

                { err && (
                  <div className="rounded-[14px] border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    <p className="text-destructive">{ err.message }</p>
                    { err.hint && (
                      <p className="mt-1 text-xs text-muted-foreground">{ err.hint }</p>
                    ) }
                    { err.action && (
                      <Link
                        href={ err.action.href }
                        className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
                      >
                        { err.action.label } →
                      </Link>
                    ) }
                  </div>
                ) }
              </form>

              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>No signup · 3 audits/day</span>
                <span aria-hidden>·</span>
                <span>50 pages per audit</span>
                <span aria-hidden>·</span>
                <span>24h retention (anon)</span>
                <span aria-hidden>·</span>
                <Link href="/limits" className="hover:text-foreground hover:underline">
                  See all limits
                </Link>
              </p>
              <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-block h-1 w-1 rounded-full bg-success" />
                Analytics-safe — audit runs won&apos;t touch your GA, PostHog, Mixpanel, or session-replay dashboards.
              </p>
            </div>

            <div className="flex flex-col gap-3 md:pt-8 lg:pt-10">
              <LiveDemo />
              <p className="text-xs text-muted-foreground">
                ↑ Each tile = one page. Color = worst rule that fires on that
                page. Watch the identity mark in the nav.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-5xl px-5 py-20 sm:py-24">
          <div className="mb-14 max-w-2xl">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Field report</p>
            <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
              Three pSEO sites,{ " " }
              <span
                style={ {
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                } }
              >
                three shapes of risk.
              </span>
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Names redacted. Each grid is 200 sampled pages. Lower score = safer.
            </p>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/60 backdrop-blur-sm">
            { RECEIPTS.map((r, i) => {
              const cleanRules = 40 - Math.round(r.score / 2.5);
              return (
                <article
                  key={ r.host }
                  className={ `grid gap-6 p-7 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.85fr)] sm:items-center sm:gap-10 ${i > 0 ? "border-t border-border/60" : ""
                    }` }
                >
                  <div>
                    <TileGrid states={ r.tiles } title={ `${r.host} audit tile map` } />
                  </div>
                  <div className="flex flex-col items-start sm:items-end">
                    <span
                      className={ `leading-[0.9] tabular-nums ${scoreToneClass(r.score)}` }
                      style={ {
                        fontSize: "88px",
                        fontFamily: "var(--font-display)",
                      } }
                    >
                      { r.score }
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Risk score
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[10px] text-success">
                      <span className="inline-block h-1 w-1 rounded-full bg-success" />
                      { cleanRules } of 40 clean
                    </span>
                  </div>
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{ r.host }</p>
                    <h3
                      className="mt-2 tracking-tight"
                      style={ {
                        fontFamily: "var(--font-display)",
                        fontStyle: "italic",
                        fontWeight: 400,
                        fontSize: "28px",
                        lineHeight: 1.1,
                      } }
                    >
                      { r.verdict }
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{ r.note }</p>
                  </div>
                </article>
              );
            }) }
          </div>
        </div>
      </section>

      <CliMarquee />

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <h2 className="max-w-xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
              One URL. 60 seconds.{ " " }
              <span
                style={ {
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                } }
              >
                A verdict you can ship.
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#top"
                onClick={ (e) => {
                  e.preventDefault();
                  document.getElementById("url")?.focus();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                } }
                className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start free audit
              </a>
              <Link
                href="/pricing"
                className="inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function scoreToneClass(score: number): string {
  if (score <= 40) return "text-success";
  if (score <= 69) return "text-warning";
  return "text-destructive";
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
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
        hint: "Pro lifts it to 50 per day and unlocks 1,000-page crawls.",
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
    return {
      message: "That URL couldn't be processed.",
      hint: message,
    };
  }
  if (status === 503) {
    return {
      message: "New audits are paused.",
      hint: message,
    };
  }
  return { message };
}

function buildTiles({
  errors,
  warnings,
  infos,
  errorStart = 0,
  warnStart,
  infoStart,
  total = 200,
}: {
  errors: number;
  warnings: number;
  infos: number;
  errorStart?: number;
  warnStart?: number;
  infoStart?: number;
  total?: number;
}): TileState[] {
  const ws = warnStart ?? errorStart + errors;
  const is = infoStart ?? ws + warnings;
  const states: TileState[] = new Array(total).fill("clean");
  for (let i = errorStart; i < errorStart + errors && i < total; i++) states[i] = "error";
  for (let i = ws; i < ws + warnings && i < total; i++)
    if (states[i] === "clean") states[i] = "warning";
  for (let i = is; i < is + infos && i < total; i++) if (states[i] === "clean") states[i] = "info";
  return states;
}

const RECEIPTS = [
  {
    host: "airport-hotels.example",
    score: 87,
    verdict: "Doorway garden",
    note: "240k pages across /hotel-[city] templates. 94% of pages scored below 30 on uniqueness. SpamBrain treats these as a single thin cluster — one structural fix, not 240,000.",
    tiles: buildTiles({ errors: 146, warnings: 42, infos: 8 }),
  },
  {
    host: "legal-directory.example",
    score: 62,
    verdict: "AI-generated, no receipts",
    note: "Structural hygiene is fine. Every article is credible prose. Zero citations, zero bylines — signals SpamBrain increasingly uses to distinguish generation from reporting.",
    tiles: buildTiles({ errors: 18, warnings: 76, infos: 32, errorStart: 40 }),
  },
  {
    host: "recipe-programmatic.example",
    score: 34,
    verdict: "Clean run",
    note: "180 category pages with genuine variation in ingredient lists, prep time, first-person intros. Templates exist, but each page has a human-sized reason to exist. Rare.",
    tiles: buildTiles({ errors: 4, warnings: 22, infos: 14, errorStart: 60 }),
  },
] as const;
