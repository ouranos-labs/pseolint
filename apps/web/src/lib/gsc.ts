/**
 * Google Search Console (GSC) integration client.
 *
 * Handles the OAuth 2.0 grant flow, encrypted token storage in the
 * `integrations` table, automatic access-token refresh, and the two
 * Search Console API endpoints we actually call: `sites.list` and
 * `searchAnalytics.query`.
 *
 * One row per (user, kind='gsc') in `integrations`. The OAuth scope grant
 * is per-user; the per-domain property URL ("which GSC site feeds this
 * monitored domain") lives on `monitoredDomains.gscSiteUrl`.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { integrations, monitoredDomains } from "@/db/schema";
import { env } from "@/lib/env";
import { sealSecret, openSecret } from "@/lib/secret-box";

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/indexing";
const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";

/** OAuth state TTL: 10 min is plenty for the round-trip through Google. */
const STATE_TTL_MS = 10 * 60 * 1000;
/** Refresh access tokens this many ms before they expire to absorb clock skew. */
const REFRESH_SKEW_MS = 60 * 1000;

export type GscTokens = {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601 string. */
  expiresAt: string;
};

/** Throws if Google OAuth is not configured for this deployment. */
export function gscOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) {
    throw new Error("GSC integration requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }
  return {
    clientId: e.GOOGLE_CLIENT_ID,
    clientSecret: e.GOOGLE_CLIENT_SECRET,
    redirectUri: `${e.BETTER_AUTH_URL.replace(/\/$/, "")}/api/integrations/gsc/callback`,
  };
}

/** Build the Google authorize URL the user should be redirected to. */
export function buildAuthorizeUrl(state: string): string {
  const cfg = gscOAuthConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GSC_SCOPE,
    // offline + consent guarantees we get a refresh_token even if the user
    // previously consented; without prompt=consent Google sometimes elides it.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/** Sealed-cookie state: pack userId+nonce+ts and AES-GCM-seal it. */
export function packState(userId: string): string {
  return sealSecret(JSON.stringify({ u: userId, n: crypto.randomUUID(), t: Date.now() }));
}

/** Verify and unpack state from the callback. Throws if expired or malformed. */
export function unpackState(state: string): { userId: string } {
  let parsed: { u?: string; t?: number };
  try {
    parsed = JSON.parse(openSecret(state));
  } catch {
    throw new Error("invalid OAuth state");
  }
  if (typeof parsed.u !== "string" || typeof parsed.t !== "number") {
    throw new Error("invalid OAuth state");
  }
  if (Date.now() - parsed.t > STATE_TTL_MS) {
    throw new Error("OAuth state expired; please try again");
  }
  return { userId: parsed.u };
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCodeForTokens(code: string): Promise<GscTokens> {
  const cfg = gscOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  if (!json.refresh_token) {
    throw new Error("Google did not return a refresh_token; re-grant with prompt=consent");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}

/** Refresh an access token using the stored refresh token. */
async function refreshTokens(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const cfg = gscOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}

/** Persist tokens to the integrations table. Upserts by (userId, kind='gsc'). */
export async function persistGscTokens(userId: string, tokens: GscTokens): Promise<void> {
  const sealed = sealSecret(JSON.stringify(tokens));
  await db.insert(integrations).values({
    userId,
    kind: "gsc",
    encryptedTokens: sealed,
    scope: GSC_SCOPE,
  }).onConflictDoUpdate({
    target: [integrations.userId, integrations.kind],
    set: { encryptedTokens: sealed, scope: GSC_SCOPE },
  });
}

/** Load + decrypt + auto-refresh tokens. Returns null if no integration. */
export async function loadGscTokens(userId: string): Promise<GscTokens | null> {
  const [row] = await db.select().from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.kind, "gsc")))
    .limit(1);
  if (!row?.encryptedTokens) return null;

  let tokens: GscTokens;
  try {
    tokens = JSON.parse(openSecret(row.encryptedTokens)) as GscTokens;
  } catch {
    // Sealed payload changed shape or key rotated. Force re-grant.
    return null;
  }

  const expiresMs = new Date(tokens.expiresAt).getTime();
  if (Number.isFinite(expiresMs) && expiresMs - REFRESH_SKEW_MS > Date.now()) {
    return tokens;
  }

  // Access token expired; refresh and persist before returning.
  const refreshed = await refreshTokens(tokens.refreshToken);
  const next: GscTokens = {
    accessToken: refreshed.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: refreshed.expiresAt,
  };
  await persistGscTokens(userId, next);
  return next;
}

export async function disconnectGsc(userId: string): Promise<void> {
  await db.delete(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.kind, "gsc")));
}

/** Stamp the last-sync timestamp; used by the cron after each run. */
export async function markGscSynced(userId: string, at: Date = new Date()): Promise<void> {
  await db.update(integrations)
    .set({ lastSyncAt: at })
    .where(and(eq(integrations.userId, userId), eq(integrations.kind, "gsc")));
}

// ---------------------------------------------------------------------------
// Search Console API
// ---------------------------------------------------------------------------

export type GscSite = { siteUrl: string; permissionLevel: string };

/**
 * True when a GSC property entry proves the connected user controls the site,
 * making it valid evidence of domain ownership on its own.
 *
 * `listSites` already drops `siteUnverifiedUser`, so every entry it returns has
 * passed Google's own DNS / HTML-file / Analytics verification: strictly
 * stronger than our `_pseolint-verify` TXT check. On top of that we require
 * owner-or-full access so a `siteRestrictedUser` grant (a read-only delegate
 * who does not control the site) never counts as an ownership claim.
 */
export function provesGscOwnership(site: GscSite): boolean {
  return site.permissionLevel === "siteOwner" || site.permissionLevel === "siteFullUser";
}

export async function listSites(userId: string): Promise<GscSite[]> {
  const tokens = await loadGscTokens(userId);
  if (!tokens) throw new Error("GSC not connected");
  const res = await fetch(`${API_BASE}/sites`, {
    headers: { authorization: `Bearer ${tokens.accessToken}` },
  });
  if (!res.ok) throw new Error(`GSC sites.list failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { siteEntry?: GscSite[] };
  return (json.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser");
}

export type GscPageRow = { url: string; clicks: number; impressions: number; ctr: number; position: number };

export type GscPageQueryRow = {
  url: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/**
 * Query Search Analytics for a property, dimensioned by `page`. Returns one
 * row per URL in the date range. 2026-05-06: rowLimit lowered from 25 000 to
 * 5 000 as part of the Neon-transfer hotfix. The cron upserts every returned
 * row into `gsc_page_metrics`, and the dashboard later reads the top-500 by
 * impressions; rows beyond the top 5 000 contribute negligibly to either the
 * upsert cost or the visible card. Sites with deeper long-tails would need
 * pagination via `startRow` (deferred: typical pSEO traffic is heavy-headed
 * and the impression-weighted card metrics are unchanged at visible
 * precision below 5 000 rows).
 */
export async function querySearchAnalyticsByPage(
  userId: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscPageRow[]> {
  const tokens = await loadGscTokens(userId);
  if (!tokens) throw new Error("GSC not connected");
  const res = await fetch(
    `${API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["page"],
        rowLimit: 5000,
      }),
    },
  );
  if (!res.ok) throw new Error(`GSC searchAnalytics.query failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
  };
  return (json.rows ?? []).map((r) => ({
    url: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

/**
 * Query Search Analytics for a property dimensioned by `page` AND `query`.
 * Used by the growth self-measurement sync (our own property): distinct from
 * the page-only Pro sync. Returns one row per (url, query) in the date range.
 */
export async function querySearchAnalyticsByPageQuery(
  userId: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscPageQueryRow[]> {
  const tokens = await loadGscTokens(userId);
  if (!tokens) throw new Error("GSC not connected");
  const res = await fetch(
    `${API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["page", "query"],
        rowLimit: 5000,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`GSC searchAnalytics.query (page,query) failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
  };
  return (json.rows ?? []).map((r) => ({
    url: r.keys[0],
    query: r.keys[1],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

/** "YYYY-MM" for the current month in UTC, used as the `monthBucket` key. */
export function monthBucketUtc(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** ISO-8601 week key "YYYY-Www" in UTC (e.g. "2026-W02"). The week-year can
 * differ from the calendar year around Jan 1 / Dec 31: ISO weeks belong to
 * the year containing their Thursday. */
export function weekBucketUtc(d: Date = new Date()): string {
  // Copy to a UTC date at midnight.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // ISO weekday: Mon=1..Sun=7. Shift to the Thursday of this week.
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

/** Date range for the last `days` days, formatted as YYYY-MM-DD in UTC. */
export function rollingDateRange(days = 28): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}

// ---------------------------------------------------------------------------
// Auto-binding GSC properties to monitored domains
// ---------------------------------------------------------------------------

interface PropertyMatch {
  siteUrl: string;
  /** Lower is better. */
  confidence: number;
}

/**
 * Score how well a GSC property URL matches a monitored host. Confidence:
 *   0 → URL prefix `https://{host}/` (or http): exact match including www-state
 *   1 → URL prefix matching the host's www-variant (naked vs www)
 *   2 → Domain property `sc-domain:{host}`: exact host match
 *   3 → Domain property covering host as a subdomain (e.g. sc-domain:example.com for blog.example.com)
 * Returns null for: unrelated hosts, subpath-only URL prefixes
 * (`https://example.com/blog/`), unparseable URLs.
 *
 * Why subpath properties are rejected: if a user has both `sc-domain:example.com`
 * and `https://example.com/blog/` and we pick the subpath, we'd weight the
 * whole monitored host's findings using a sliver of its traffic: silently
 * wrong. Better to leave unbound and let the user choose.
 */
export function scorePropertyMatch(siteUrl: string, host: string): PropertyMatch | null {
  const monitoredHost = host.toLowerCase();
  const monitoredNaked = monitoredHost.replace(/^www\./, "");

  if (siteUrl.startsWith("sc-domain:")) {
    const dom = siteUrl.slice("sc-domain:".length).toLowerCase();
    if (dom === monitoredNaked) return { siteUrl, confidence: 2 };
    if (monitoredNaked.endsWith(`.${dom}`)) return { siteUrl, confidence: 3 };
    return null;
  }

  let parsed: URL;
  try { parsed = new URL(siteUrl); } catch { return null; }
  // Subpath properties cover only part of the site; we don't auto-bind them.
  if (parsed.pathname !== "/") return null;
  const propHost = parsed.host.toLowerCase();
  const propNaked = propHost.replace(/^www\./, "");
  if (propNaked !== monitoredNaked) return null;
  // Same naked host: distinguish exact match vs www-variant.
  return { siteUrl, confidence: propHost === monitoredHost ? 0 : 1 };
}

/**
 * Pick the single best GSC property for a host, or null if no unambiguous
 * match exists. Returns null when two properties tie at the best confidence;
 * silent wrong-binding would be worse than no binding (user would see
 * traffic-weighted ranks based on a property that isn't theirs and have no
 * way to diagnose it).
 */
export function pickBestGscProperty(sites: readonly GscSite[], host: string): string | null {
  const matches = sites
    .map((s) => scorePropertyMatch(s.siteUrl, host))
    .filter((m): m is PropertyMatch => m != null)
    .sort((a, b) => a.confidence - b.confidence);
  if (matches.length === 0) return null;
  if (matches.length > 1 && matches[1].confidence === matches[0].confidence) return null;
  return matches[0].siteUrl;
}

export interface AutoBindResult {
  bound: number;
  ambiguous: number;
  unmatched: number;
}

/**
 * Auto-bind every unbound monitored domain for a user, using the highest-
 * confidence unique match against their GSC property list. Idempotent and
 * best-effort: any failure (no grant, revoked perms, network) returns zero
 * counts rather than throwing: caller should treat this as a UX nicety, not
 * a critical step.
 */
export async function autoBindGscPropertiesForUser(userId: string): Promise<AutoBindResult> {
  let sites: GscSite[];
  try {
    sites = await listSites(userId);
  } catch {
    return { bound: 0, ambiguous: 0, unmatched: 0 };
  }
  if (sites.length === 0) return { bound: 0, ambiguous: 0, unmatched: 0 };

  const unbound = await db
    .select({
      id: monitoredDomains.id,
      host: monitoredDomains.host,
      verifiedAt: monitoredDomains.verifiedAt,
    })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.userId, userId),
      isNull(monitoredDomains.gscSiteUrl),
      isNull(monitoredDomains.removedAt),
    ));

  let bound = 0, ambiguous = 0, unmatched = 0;
  for (const d of unbound) {
    const matches = sites
      .map((s) => scorePropertyMatch(s.siteUrl, d.host))
      .filter((m): m is PropertyMatch => m != null)
      .sort((a, b) => a.confidence - b.confidence);
    if (matches.length === 0) { unmatched++; continue; }
    if (matches.length > 1 && matches[1].confidence === matches[0].confidence) {
      ambiguous++;
      continue;
    }
    // A matched owner-or-full property doubles as domain verification, so
    // connecting Search Console starts monitoring without a TXT record. Only
    // stamped when still unverified; never re-dates an existing verification.
    const entry = sites.find((s) => s.siteUrl === matches[0].siteUrl);
    const verifies = !d.verifiedAt && entry != null && provesGscOwnership(entry);
    await db.update(monitoredDomains)
      .set({
        gscSiteUrl: matches[0].siteUrl,
        ...(verifies && { verifiedAt: new Date() }),
      })
      .where(eq(monitoredDomains.id, d.id));
    bound++;
  }
  return { bound, ambiguous, unmatched };
}
