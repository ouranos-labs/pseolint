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
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { env } from "@/lib/env";
import { sealSecret, openSecret } from "@/lib/secret-box";

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";

/** OAuth state TTL — 10 min is plenty for the round-trip through Google. */
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
    throw new Error("OAuth state expired — please try again");
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
    throw new Error("Google did not return a refresh_token — re-grant with prompt=consent");
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

  // Access token expired — refresh and persist before returning.
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

/**
 * Query Search Analytics for a property, dimensioned by `page`. Returns one
 * row per URL in the date range. Caps at 25 000 rows (GSC API hard limit per
 * call); larger sites would need pagination via `startRow` — out of scope for
 * v1.1, since a 25 k cap covers ~99% of the customers we expect.
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
        rowLimit: 25000,
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

/** "YYYY-MM" for the current month in UTC — used as the `monthBucket` key. */
export function monthBucketUtc(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Date range for the last `days` days, formatted as YYYY-MM-DD in UTC. */
export function rollingDateRange(days = 28): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}
