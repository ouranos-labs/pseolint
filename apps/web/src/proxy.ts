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

  const scriptSrc = isProd
    ? "'self' 'unsafe-inline' challenges.cloudflare.com"
    : `'self' 'unsafe-inline' ${CSP_DEV_DYNAMIC_CODE} challenges.cloudflare.com`;

  res.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src challenges.cloudflare.com *.r2.cloudflarestorage.com; connect-src 'self' challenges.cloudflare.com;`,
  );
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
