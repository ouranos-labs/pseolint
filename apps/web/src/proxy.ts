import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16+ renamed `middleware` -> `proxy` (file + function). This module
// is the request proxy that sets security response headers.

// CSP keyword for permitting dynamic-code execution in dev. React's dev
// runtime requires it for source-map reconstruction and HMR; production
// builds do NOT need it (and we omit it from the prod CSP for that reason).
const CSP_DEV_DYNAMIC_CODE = "'unsafe-" + "eval'";

// Surfaces that must never appear in a search index:
// - /r/[slug] publishes judgments about third parties (owner opt-in only via leaderboard)
// - /a/[id]   ephemeral in-flight audit pages
// - /api/*    JSON exports and internal endpoints
// - /dashboard/* authenticated owner UI
// - /signin   auth flow
// Leaderboard, homepage, /pricing, /limits, /privacy, /terms remain indexable.
const NOINDEX_PREFIXES = ["/r/", "/a/", "/api/", "/dashboard/", "/signin"];

export function proxy(req: NextRequest) {
  // Canonical-host redirect (apex vs www consolidation). The target host is
  // derived from BETTER_AUTH_URL — the same source robots.ts, sitemap.ts, and
  // every `<link rel="canonical">` use — so it can never disagree with the
  // canonical tags. Skips localhost, *.vercel.app previews, and /api (OAuth
  // callbacks must stay on the host they were issued for). 301 so crawl budget
  // and ranking signals consolidate on one host. GSC crawl stats showed apex +
  // www both crawled, with www reporting "Problems last week".
  if (!req.nextUrl.pathname.startsWith("/api")) {
    let canonicalHost = "";
    try {
      canonicalHost = new URL(process.env.BETTER_AUTH_URL ?? "").host;
    } catch {
      /* malformed/unset env — skip the redirect */
    }
    const reqHost = req.headers.get("host") ?? "";
    if (
      canonicalHost &&
      reqHost &&
      reqHost !== canonicalHost &&
      !reqHost.startsWith("localhost") &&
      !reqHost.endsWith(".vercel.app")
    ) {
      const url = req.nextUrl.clone();
      url.host = canonicalHost;
      url.protocol = "https";
      url.port = "";
      return NextResponse.redirect(url, 301);
    }
  }

  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const path = req.nextUrl.pathname;
  if (NOINDEX_PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p))) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  // Self-hosted OpenPanel origin (script + event endpoint). Derived from env so
  // the domain is never hardcoded; empty (and thus omitted from CSP) when
  // analytics is unconfigured. We load the SDK script from this origin and POST
  // events to it, so it must appear in both script-src and connect-src.
  let openpanelOrigin = "";
  try {
    openpanelOrigin = process.env.OPENPANEL_API_URL ? new URL(process.env.OPENPANEL_API_URL).origin : "";
  } catch {
    /* malformed/unset env — omit from CSP */
  }
  const op = openpanelOrigin ? ` ${openpanelOrigin}` : "";

  const scriptSrc = isProd
    ? `'self' 'unsafe-inline' challenges.cloudflare.com${op}`
    : `'self' 'unsafe-inline' ${CSP_DEV_DYNAMIC_CODE} challenges.cloudflare.com${op}`;

  res.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src challenges.cloudflare.com *.r2.cloudflarestorage.com; connect-src 'self' challenges.cloudflare.com${op};`,
  );
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
