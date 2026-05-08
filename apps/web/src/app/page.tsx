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
import { TemplateBreakdownHero } from "@/components/landing/template-breakdown-hero";
import { normalizeUserUrl } from "@/lib/normalize-url";
import { scoreTone } from "@/lib/grade";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement | string,
        o: { sitekey: string; callback: (t: string) => void; "error-callback"?: () => void; "expired-callback"?: () => void },
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

const TOS_STORAGE_KEY = "pseolint:audit-authorized-v1";

export default function Home() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<FormError | null>(null);
  const router = useRouter();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const [force, setForce] = useState(false);
  // Authorization attestation — remembered across visits once checked so
  // repeat users don't re-tick. Legal cover, not security.
  const [authorized, setAuthorized] = useState(false);
  const [tosGateShown, setTosGateShown] = useState(false);

  useEffect(() => {
    try {
      const params = new URL(window.location.href).searchParams;
      const prefill = params.get("prefill");
      if (prefill) setUrl(prefill);
      if (params.get("force") === "1") setForce(true);
    } catch {}
    try {
      if (window.localStorage.getItem(TOS_STORAGE_KEY) === "1") {
        setAuthorized(true);
      }
      // Otherwise leave the gate hidden — it expands on the first submit
      // attempt (keeps the primary CTA above the fold for first-time visitors).
    } catch {
      // localStorage unavailable — fall back to the submit-time gate.
    }
  }, []);

  const onAuthorizedChange = (checked: boolean): void => {
    setAuthorized(checked);
    try {
      if (checked) window.localStorage.setItem(TOS_STORAGE_KEY, "1");
      else window.localStorage.removeItem(TOS_STORAGE_KEY);
    } catch {}
  };

  // Turnstile mount: render explicitly via the script's `?onload=` callback so we
  // don't have to poll for `window.turnstile`. The callback may fire before this
  // effect runs (script already cached) or after, so we handle both paths.
  useEffect(() => {
    if (!siteKey) return;
    let widgetId: string | undefined;

    const render = (): void => {
      if (!window.turnstile) return;
      const el = document.getElementById("turnstile-widget");
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
        try { window.turnstile.remove(widgetId); } catch {}
      }
    };
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
        body: JSON.stringify({
          url: normalized,
          turnstileToken: token,
          ...(force ? { force: true } : {}),
        }),
      });
      if (res.ok) {
        const { auditId, reportUrl, cached } = await res.json();
        // When the API returns a cached/deduped report, surface that on the report
        // page so the caller knows they're looking at the most recent public audit
        // of this URL — not necessarily their own scan.
        const next = cached && reportUrl ? `${reportUrl}?cached=1` : `/a/${auditId}`;
        router.push(next);
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
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady" async defer />

      <section className="relative">
        <div className="mx-auto max-w-5xl px-5 pb-16 pt-16 sm:pt-20">
          <div className="grid gap-10 md:grid-cols-2 md:gap-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-12">
            <div className="flex flex-col gap-6">
              <div className="hidden items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground sm:flex">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Template-aware SpamBrain + AEO · v0.6.3
              </div>

              <h1 className="text-balance text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">
                Most programmatic SEO is doorway-page gardening. v0.6 audits your templates, not just URLs.
              </h1>

              <p className="text-base leading-relaxed text-muted-foreground">
                An audit specifically for programmatic-SEO sites (template-driven content at scale)
                and AI Overview readiness. Paste your site. In 60 seconds, see which templates are
                broken and which are clean — site-type-aware scoring across SpamBrain classifier
                triggers and Answer Engine Optimization (how citable your pages are to ChatGPT,
                Perplexity, and Google AI Overviews). Not a general SEO audit — see scope below.
              </p>

              <form onSubmit={ submit } className="flex flex-col gap-3">
                <label htmlFor="url" className="sr-only">
                  Site URL
                </label>
                <Input
                  id="url"
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={ false }
                  required
                  value={ url }
                  onChange={ (e) => setUrl(e.target.value) }
                  onBlur={ () => { const n = normalizeUserUrl(url); if (n) setUrl(n); } }
                  placeholder="yoursite.com"
                  className="h-11"
                />

                { tosGateShown && (
                  <label className="flex items-start gap-2 rounded-[14px] border border-border/60 bg-card/40 p-3 text-xs leading-relaxed text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={ authorized }
                      onChange={ (e) => onAuthorizedChange(e.target.checked) }
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong"
                      aria-label="Confirm authorization to audit"
                    />
                    <span>
                      I have authorization to audit the URL above (it&apos;s mine, or I have the owner&apos;s permission). Audits respect <code className="font-mono text-[10px]">robots.txt</code> by default.
                    </span>
                  </label>
                ) }

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

                <Button
                  type="submit"
                  disabled={ submitting }
                  className="h-11 w-full font-semibold"
                >
                  { submitting ? "Starting audit…" : "Audit my site — free" }
                </Button>

                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  We fetch up to ~500 pages over a few minutes — if it&apos;s your site and it&apos;s cache-cold, warm it first.
                </p>

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

      <TemplateBreakdownHero />

      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-16">
          <div className="mb-8 max-w-2xl">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Scope</p>
            <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              What pseolint is — and isn&apos;t.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Self-select before you run it. The audit is narrow on purpose; if you want a 360°
              SEO crawl, the right tool is somewhere else on this page.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-[22px] border border-success/30 bg-success/5 p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-success">
                What pseolint is
              </p>
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                An audit specifically for programmatic-SEO sites (template-driven content at scale)
                and AI Overview readiness. v0.6 audits by template — K=10 URLs sampled per
                template, one verdict per template, site verdict = worst template above 5% coverage.
                Catches SpamBrain-classifier triggers from the March 27, 2026 core update, the
                May 7, 2024 site-reputation-abuse policy, the March 5, 2024 scaled-content-abuse
                update, and the AEO patterns that determine whether ChatGPT, Perplexity, and Google
                AI Overviews cite your pages.
              </p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Use it when
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                <li>— You run a programmatic SEO site (city × service grids, state × LLC fees, app × integration matrices)</li>
                <li>— You want to know which template is dragging your site score down</li>
                <li>— You&apos;re worried about a Helpful Content System / scaled-content-abuse hit</li>
                <li>— You want your pages cited in AI Overviews / Perplexity / ChatGPT search</li>
                <li>— You want a CI gate that fails the build when a template degrades</li>
              </ul>
            </div>

            <div className="rounded-[22px] border border-border/60 bg-card/60 p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What pseolint isn&apos;t
              </p>
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                A general SEO audit. We don&apos;t measure Core Web Vitals, broken links,
                competitor research, keyword research, or backlink audits. If that&apos;s what you
                need, run one of these instead:
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Core Web Vitals</span> ·{" "}
                  <a href="https://pagespeed.web.dev" className="text-primary hover:underline" rel="nofollow">PageSpeed Insights</a>{" "}
                  (free)
                </li>
                <li>
                  <span className="font-medium text-foreground">Broken links + general crawl</span> ·{" "}
                  <a href="https://sitebulb.com" className="text-primary hover:underline" rel="nofollow">Sitebulb</a> ($35/mo) or{" "}
                  <a href="https://screamingfrog.co.uk" className="text-primary hover:underline" rel="nofollow">Screaming Frog</a> ($259/yr, free up to 500 URLs)
                </li>
                <li>
                  <span className="font-medium text-foreground">Competitor research / backlinks</span> ·{" "}
                  <a href="https://ahrefs.com" className="text-primary hover:underline" rel="nofollow">Ahrefs</a> ($129/mo)
                </li>
                <li>
                  <span className="font-medium text-foreground">Keyword research</span> ·{" "}
                  <a href="https://semrush.com" className="text-primary hover:underline" rel="nofollow">Semrush</a> ($139.95/mo)
                </li>
              </ul>
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
              Names redacted. Each grid shows the dominant template&apos;s sample. Lower score = safer.
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
                      className={ `text-[64px] leading-[0.9] tabular-nums sm:text-[72px] md:text-[88px] ${scoreToneClass(r.score)}` }
                      style={ {
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
                      className="mt-2 text-2xl tracking-tight sm:text-[28px]"
                      style={ {
                        fontFamily: "var(--font-display)",
                        fontStyle: "italic",
                        fontWeight: 400,
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
        <div className="mx-auto max-w-5xl px-5 py-20 sm:py-24">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">By the numbers</p>
            <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
              The audit, in measurable terms.
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Specific values you can cite — what we run, what we cap, and which Google policies the ruleset maps to.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[28px] border border-border/70 bg-border/60 sm:grid-cols-4">
            { STATS.map((s) => (
              <div key={ s.label } className="bg-card/60 p-5 backdrop-blur-sm">
                <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{ s.label }</dt>
                <dd className="mt-2 font-mono text-base font-semibold text-foreground">{ s.value }</dd>
              </div>
            )) }
          </dl>

          <ul className="mt-8 grid gap-3 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
            <li>
              <span className="text-foreground">Template-aware SpamBrain + AEO scoring (v0.6)</span> — v0.6 pivots the unit of analysis from URL to template. K=10 URLs sampled per template, one verdict per template, site verdict = worst template with ≥5% coverage. Programmatic-directories, blogs, ecommerce, docs, and small-marketing sites remain weighted differently. Classification-driven scoring shipped in <span className="text-foreground">v0.4.3</span>; <span className="text-foreground">v0.5</span> added change-driven monitoring; <span className="text-foreground">v0.5.1</span> added <code className="font-mono text-xs">links/host-section-divergence</code>; <span className="text-foreground">v0.5.2</span> added 4 content-quality rules; <span className="text-foreground">v0.6</span> added per-template breakdown across all 32 rules.
            </li>
            <li>
              <span className="text-foreground">Engineering rigor, not marketing.</span> Doorway-pattern findings cluster by template (one line per template group, not per-pair noise). <code className="font-mono text-xs">--sample-seed</code> makes verdicts reproducible across runs. Info-severity findings can&apos;t accumulate past a per-bucket cap. The open-source calibration corpus + runner + regression tests guard against engine drift on each release. Full engineering log at <Link href="/methodology" className="text-foreground underline decoration-dotted underline-offset-2">/methodology</Link>.
            </li>
            <li>
              Free tier: up to 200 pages per audit (templates detected, K=10 per template), 3 audits per browser session per day, reports retained <span className="text-foreground">24 hours</span> for anonymous runs and <span className="text-foreground">30 days</span> once you sign in.
            </li>
            <li>
              Pro tier: <span className="text-foreground">$19</span> per month for per-domain template-aware monitoring — K=10 per template every monitoring run, cumulative coverage across all templates grows over time, <span className="text-foreground">50 audits</span> per day and unlimited trend history.
            </li>
            <li>
              Detection maps to current Google policy, leading with what hit pSEO most recently: the <span className="text-foreground">March 27, 2026</span> core update that tightened scaled-content signals on date-stacked corpora, the <span className="text-foreground">May 7, 2024</span> site-reputation-abuse policy that closed the parasite-SEO loophole (now enforced by <code className="font-mono text-xs">links/host-section-divergence</code>), the <span className="text-foreground">March 5, 2024</span> scaled-content-abuse update, and the 2022 SpamBrain rebuild that moved enforcement from manual review to silent classifier-time suppression.
            </li>
            <li>
              Crawler defaults: a hard 50 MB bandwidth cap per audit, 5 parallel fetches, full <code className="font-mono text-foreground">robots.txt</code> respect including <code className="font-mono text-foreground">Crawl-delay</code> capped at <span className="text-foreground">2 minutes</span>.
            </li>
            <li>
              Open source: MIT-licensed at github.com/ouranos-labs/pseolint, with the core engine, CLI, GitHub Action, and MCP server published as separate packages on <span className="text-foreground">January 15, 2026</span>.
            </li>
            <li>
              SLA targets: <span className="text-foreground">99.9%</span> hosted-audit availability, deduped responses for repeat URLs in under <span className="text-foreground">5 minutes</span>, and any forced re-crawl held to a <span className="text-foreground">5 minutes</span> minimum spacing.
            </li>
            <li>
              Default thresholds: thin-content fires below <span className="text-foreground">300 words</span>, near-duplicate fires above <span className="text-foreground">85%</span> SimHash similarity, and boilerplate-ratio flags pages with over <span className="text-foreground">60%</span> shared template text.
            </li>
          </ul>
        </div>
      </section>

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
                A per-template verdict you can ship.
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
  return scoreTone(score);
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

const STATS = [
  { label: "Median audit time", value: "1 minute" },
  { label: "K per template (Pro)", value: "10 URLs" },
  { label: "Pro plan", value: "$19 / month" },
  { label: "Anon retention", value: "24 hours" },
] as const;

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
