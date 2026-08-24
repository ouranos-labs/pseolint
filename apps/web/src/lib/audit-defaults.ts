/**
 * Default ignore patterns applied to every audit run via the public web form
 * (`/api/audits` → Inngest `run-audit`). These exclude routes that are never
 * marketing content and would just add noise to the report.
 *
 * Why this lives in the WEB app, not the engine:
 *
 *   The CLI engine (@pseolint/core) is policy-free on purpose: it audits
 *   exactly the URLs you point it at. Power users running it locally know
 *   their own surface and can declare ignores in `pseolint.config.ts`. But
 *   end users running an audit via the public form have no way to know they
 *   should exclude `/signin` or `/api/foo`. The web app is the right layer to
 *   apply opinionated defaults: bundled with the same UX it delivers
 *   (no-signup, 60-second audit, sensible output).
 *
 * Categories below are roughly in order of confidence:
 *
 *   1. Framework metadata routes: emitted by Next.js, Vercel, Astro, Nuxt.
 *      These return PNG/JSON, not HTML; auditing them produces empty findings.
 *   2. API routes: return JSON. Same reason.
 *   3. Auth surfaces: signin / login / register pages. These are short stubs
 *      with no marketing body content; they fail thin-content / citable-facts /
 *      answer-first rules and pollute the report. Convention is dense enough
 *      across Next.js, Remix, Astro, WordPress, and Rails apps that the
 *      false-positive risk on real marketing routes is very low.
 *   4. Admin / dashboard surfaces: private app shells. Same reasoning.
 *
 * Edge cases we accept:
 *
 *   - A real-estate listing site with `/admin/listings/[id]` as REAL marketing
 *     URLs would skip those pages. Mitigation: power users hit the CLI with
 *     a custom config; the web form is for the typical case.
 *   - Sites that root their docs/blog under `/api/docs/*`. Mitigation: same.
 *
 * Pro / future: surface this list as an editable per-domain setting so Pro
 * users can opt in/out per pattern. v0.4.2 candidate.
 */
export const WEB_AUDIT_DEFAULT_IGNORE: readonly string[] = [
  // Framework metadata (Next.js, Vercel, Astro, Nuxt, generic _next/_vercel)
  "**/apple-icon*",
  "**/icon",
  "**/icon.*",
  "**/icon-*",
  "**/opengraph-image*",
  "**/twitter-image*",
  "**/_next/**",
  "**/_vercel/**",
  "**/_astro/**",
  "**/_nuxt/**",

  // API routes: return JSON, not marketing HTML
  "**/api/**",

  // Auth surfaces
  "**/signin*",
  "**/sign-in*",
  "**/login*",
  "**/log-in*",
  "**/signup*",
  "**/sign-up*",
  "**/register*",
  "**/sso*",
  "**/oauth/**",
  "**/auth/**",

  // WordPress conventions
  "**/wp-admin/**",
  "**/wp-login*",
  "**/wp-json/**",
  "**/xmlrpc.php",

  // Admin / dashboard / private app shells
  "**/admin/**",
  "**/dashboard/**",
  "**/account/settings/**",
];

/**
 * Framework-specific ignore patterns layered on top of WEB_AUDIT_DEFAULT_IGNORE
 * when the site classifier auto-detects a known framework. Patterns are merged
 * additively: the base list still applies; these add framework-idiomatic
 * paths the generic patterns might miss.
 */
export const FRAMEWORK_IGNORE_PATTERNS: Record<string, readonly string[]> = {
  nextjs: [
    "**/_next/data/**",         // build-time data fetches
    "**/_next/image**",         // optimized image proxy
    "**/_next/static/**",
    "**/api/auth/**",           // NextAuth.js convention
    "**/_error",                // error route
    "**/404",
    "**/500",
  ],
  wordpress: [
    "**/wp-content/uploads/**", // media library
    "**/wp-includes/**",
    "**/wp-cron.php",
    "**/feed/**",               // /feed, /comments/feed, etc
    "**/comments/feed/**",
    "**/author/**",             // author archives, usually thin
    "**/category/**",           // category archives, sometimes leaked from noindex defaults
    "**/tag/**",                // tag archives, same
    "**/page/[0-9]*/**",        // pagination tail
    "**/?p=*",                  // legacy ?p= permalinks
  ],
  shopify: [
    "**/cart**",
    "**/checkout**",
    "**/account/**",
    "**/orders/**",
    "**/policies/**",           // Shopify auto-generates policy pages
    "**/cdn/shop/**",           // Shopify CDN
    "**/?variant=*",            // variant URLs (canonical to product)
    "**/products/.json",        // JSON product feed
  ],
  webflow: [
    "**/style-guide**",         // Webflow's default style-guide page
    "**/utility-pages/**",
    "**/passwords**",           // Webflow password-protected page UI
    "**/cms-*",                 // Webflow CMS preview routes
  ],
  astro: [
    "**/_astro/**",
    "**/_image**",
  ],
  nuxt: [
    "**/_nuxt/**",
    "**/__nuxt_island/**",
    "**/api/_content/**",
  ],
  remix: [
    "**/build/**",
    "**/__manifest**",
    "**/__index**",
  ],
};

/**
 * Resolve the full ignore list for an audit, merging the base
 * WEB_AUDIT_DEFAULT_IGNORE with any framework-specific additions. Caller
 * passes the detected framework string from `detectFrameworkFromUrl()` (or
 * from `summary.siteClassification.signals` where `kind === "framework-
 * detected"`). Unknown / undefined framework → base only.
 */
export function resolveAuditIgnorePatterns(framework?: string): string[] {
  const base = [...WEB_AUDIT_DEFAULT_IGNORE];
  if (!framework) return base;
  const extra = FRAMEWORK_IGNORE_PATTERNS[framework];
  return extra ? [...base, ...extra] : base;
}

/**
 * Lightweight framework detection from a single root-page fetch. Used by the
 * hosted form audit to pick the right framework-specific ignore patterns
 * before the full audit fires. Tolerant of network errors: returns
 * undefined on any failure so the audit still runs with base defaults only.
 *
 * Honors an optional AbortSignal so callers can cap the preflight latency
 * (the run-audit Inngest step wraps this in a 5s AbortController).
 */
export async function detectFrameworkFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal,
      headers: { "user-agent": "pseolint-framework-detect/0.4.2" },
    });
    const xPoweredBy = (res.headers.get("x-powered-by") ?? "").toLowerCase();
    const server = (res.headers.get("server") ?? "").toLowerCase();
    const xVercel = res.headers.get("x-vercel-id");
    const xShopify =
      res.headers.get("x-shopify-stage") || res.headers.get("x-shopid");

    if (xShopify) return "shopify";
    if (xVercel) return "nextjs"; // best guess
    if (xPoweredBy.includes("next.js")) return "nextjs";
    if (
      xPoweredBy.includes("wordpress") ||
      (xPoweredBy.includes("php") && server.includes("apache"))
    )
      return "wordpress";

    // HTML body sniffing for script src patterns
    const body = await res.text();
    if (body.includes("/_next/static/")) return "nextjs";
    if (body.includes("/wp-content/")) return "wordpress";
    if (body.includes("/cdn/shop/") || body.includes("Shopify.theme")) return "shopify";
    if (body.includes("webflow.com") && body.includes("data-wf-page")) return "webflow";
    if (body.includes("/_astro/")) return "astro";
    if (body.includes("/_nuxt/")) return "nuxt";
  } catch {
    /* network errors / abort → no framework detection, use base defaults */
  }
  return undefined;
}
