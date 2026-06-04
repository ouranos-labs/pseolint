"use server";

import { and, eq, desc, gte } from "drizzle-orm";
import { getRequiredSession } from "@/lib/session";
import { db } from "@/db";
import {
  monitoredDomains,
  integrations,
  indexingRequests,
  audits,
  gscPageMetrics
} from "@/db/schema";
import {
  pushToGoogleIndexing,
  pushToIndexNow,
} from "@/lib/indexing";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { revalidatePath } from "next/cache";
import { getPlan } from "@/lib/plan";
import { loadGscTokens } from "@/lib/gsc";
import { GOOGLE_INDEXING_ENABLED, GOOGLE_INDEXING_COMING_SOON } from "@/lib/flags";

/**
 * Trigger an indexing request for a specific URL or the entire domain (via IndexNow).
 * Gated by:
 *   1. Auth + ownership
 *   2. Plan (Pro only for Google Indexing)
 *   3. Audit Quality Gate (Risk < 40 / CAUTION)
 */
export async function requestIndexingAction(args: {
  domainId: string;
  url: string;
  provider: "google" | "indexnow";
}) {
  const session = await getRequiredSession();

  // 0. Feature gate — Google submission is "Coming soon" until re-enabled.
  if (args.provider === "google" && !GOOGLE_INDEXING_ENABLED) {
    return { error: GOOGLE_INDEXING_COMING_SOON };
  }

  // 1. Verify ownership and domain status
  const [domain] = await db
    .select()
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.id, args.domainId),
      eq(monitoredDomains.userId, session.user.id)
    ))
    .limit(1);

  if (!domain) throw new Error("Domain not found");

  // 1c. URL Hostname Containment (Prevent injection of arbitrary external spam URLs)
  try {
    const urlObj = new URL(args.url);
    const domainHost = domain.host.toLowerCase();
    const urlHost = urlObj.hostname.toLowerCase();
    if (urlHost !== domainHost && !urlHost.endsWith("." + domainHost)) {
      return { error: "Security Violation: URL hostname does not match monitored domain." };
    }
  } catch {
    return { error: "Security Violation: Invalid URL format." };
  }

  // 1b. Plan validation (Pro only for Google Indexing)
  if (args.provider === "google") {
    const plan = await getPlan(session.user.id);
    if (plan !== "pro") {
      return { error: "Google Indexing API is a Pro-only feature. Please upgrade your subscription." };
    }
  }

  // 1c. Duplicate Request Guard (Protect Google API and user quota from spam)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [existingRequest] = await db
    .select()
    .from(indexingRequests)
    .where(and(
      eq(indexingRequests.domainId, args.domainId),
      eq(indexingRequests.url, args.url),
      eq(indexingRequests.provider, args.provider),
      eq(indexingRequests.status, "completed"),
      gte(indexingRequests.createdAt, oneDayAgo)
    ))
    .limit(1);

  if (existingRequest) {
    return {
      error: `Indexing for this URL was already successfully requested via ${args.provider === "google" ? "Google" : "IndexNow"} in the last 24 hours.`
    };
  }

  // 1d. Impression Proxy Correlation (Quota Protection Guard)
  // Check if this page already has GSC search impressions in the database.
  // If it does, it's already indexed!
  const [metrics] = await db
    .select({ impressions: gscPageMetrics.impressions })
    .from(gscPageMetrics)
    .where(and(
      eq(gscPageMetrics.domainId, args.domainId),
      eq(gscPageMetrics.url, args.url)
    ))
    .limit(1);

  if (metrics && metrics.impressions > 0) {
    return {
      error: "Correlation Guard: This URL is already indexed (active impressions detected in GSC)."
    };
  }

  // 2. Audit Quality Gate
  // We check the most recent audit risk for this domain.
  // If risk > 40 (Concerning or Critical), we block the indexing request
  // to maintain the "Quality Gate" promise.
  if (domain.lastRisk !== null && domain.lastRisk > 40) {
    return {
      error: "Quality Gate failed: Audit risk is too high. Fix critical findings before requesting indexation."
    };
  }

  // 3. Perform Request
  try {
    if (args.provider === "google") {
      const tokens = await loadGscTokens(session.user.id);
      if (!tokens) {
        return { error: "Google Search Console is not connected. Please connect it in the Integrations tab." };
      }
      await pushToGoogleIndexing(args.url, tokens.accessToken);
    } else {
      if (!domain.indexNowKey) {
        return { error: "IndexNow key is not configured for this domain. Please set it up in Domain Settings." };
      }
      await pushToIndexNow(domain.host, [args.url], domain.indexNowKey);
    }


    // 5. Log Request
    await db.insert(indexingRequests).values({
      userId: session.user.id,
      domainId: args.domainId,
      url: args.url,
      provider: args.provider,
      status: "completed",
      completedAt: new Date(),
    });

    revalidatePath(`/dashboard/${domain.host}`);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Indexing request failed:", message);

    const userFacingError = message.startsWith("PERMISSION_DENIED:")
      ? message.replace("PERMISSION_DENIED: ", "")
      : `Indexing request failed: ${message}`;

    await db.insert(indexingRequests).values({
      userId: session.user.id,
      domainId: args.domainId,
      url: args.url,
      provider: args.provider,
      status: "failed",
      error: message,
    });

    return { error: userFacingError };
  }
}


/**
 * Trigger batch indexing for multiple URLs.
 */
export async function requestBatchIndexingAction(args: {
  domainId: string;
  urls: string[];
  provider: "google" | "indexnow";
}) {
  const session = await getRequiredSession();

  // 0. Feature gate — Google submission is "Coming soon" until re-enabled.
  if (args.provider === "google" && !GOOGLE_INDEXING_ENABLED) {
    return { error: GOOGLE_INDEXING_COMING_SOON };
  }

  // 1. Verify ownership and domain status
  const [domain] = await db
    .select()
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.id, args.domainId),
      eq(monitoredDomains.userId, session.user.id)
    ))
    .limit(1);

  if (!domain) throw new Error("Domain not found");

  // 1c. URL Hostname Containment (Prevent batch injection of arbitrary external spam URLs)
  const domainHost = domain.host.toLowerCase();
  for (const url of args.urls) {
    try {
      const urlHost = new URL(url).hostname.toLowerCase();
      if (urlHost !== domainHost && !urlHost.endsWith("." + domainHost)) {
        return { error: `Security Violation: URL "${url}" does not belong to the monitored domain.` };
      }
    } catch {
      return { error: `Security Violation: Invalid URL format "${url}".` };
    }
  }

  // 1b. Plan validation (Pro only for Google Indexing)
  if (args.provider === "google") {
    const plan = await getPlan(session.user.id);
    if (plan !== "pro") {
      return { error: "Google Indexing API is a Pro-only feature. Please upgrade your subscription." };
    }
  }

  // 2. Quality Gate
  if (domain.lastRisk !== null && domain.lastRisk > 40) {
    return {
      error: "Quality Gate failed: Audit risk is too high. Fix critical findings before requesting indexation."
    };
  }

  // 2b. Duplicate Request Guard (Filter out URLs pushed in the last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existingRequests = await db
    .select({ url: indexingRequests.url })
    .from(indexingRequests)
    .where(and(
      eq(indexingRequests.domainId, args.domainId),
      eq(indexingRequests.provider, args.provider),
      eq(indexingRequests.status, "completed"),
      gte(indexingRequests.createdAt, oneDayAgo)
    ));

  const existingUrls = new Set(existingRequests.map((r: { url: string; }) => r.url));
  const filteredUrls = args.urls.filter(url => !existingUrls.has(url));

  if (filteredUrls.length === 0) {
    return { error: "All selected URLs have already been successfully requested in the last 24 hours." };
  }

  // 2c. Impression Proxy Correlation (Quota Protection Guard)
  // Filter out URLs that already have recorded search impressions (guaranteed indexed)
  const activeMetrics = await db
    .select({ url: gscPageMetrics.url })
    .from(gscPageMetrics)
    .where(and(
      eq(gscPageMetrics.domainId, args.domainId),
      gte(gscPageMetrics.impressions, 1)
    ));

  const indexedUrls = new Set(activeMetrics.map((m: { url: string; }) => m.url));
  const nonIndexedUrls = filteredUrls.filter(url => !indexedUrls.has(url));

  if (nonIndexedUrls.length === 0) {
    return { error: "Correlation Guard: All selected URLs are already indexed (active impressions detected in GSC)." };
  }

  // 3. Perform Request
  try {
    if (args.provider === "google") {
      const tokens = await loadGscTokens(session.user.id);
      if (!tokens) {
        return { error: "Google Search Console is not connected. Please connect it in the Integrations tab." };
      }

      // Limit batch requests to 50 at a time to prevent server/API abuse
      if (nonIndexedUrls.length > 50) {
        return { error: "Google Indexing limit: Cannot push more than 50 URLs in one batch." };
      }

      await Promise.all(nonIndexedUrls.map(url => pushToGoogleIndexing(url, tokens.accessToken)));
    } else {
      if (!domain.indexNowKey) {
        return { error: "IndexNow key is not configured for this domain. Please set it up in Domain Settings." };
      }

      await pushToIndexNow(domain.host, nonIndexedUrls, domain.indexNowKey);
    }

    // 5. Log Requests
    await Promise.all(nonIndexedUrls.map(url =>
      db.insert(indexingRequests).values({
        userId: session.user.id,
        domainId: args.domainId,
        url: url,
        provider: args.provider,
        status: "completed",
        completedAt: new Date(),
      })
    ));

    revalidatePath(`/dashboard/${domain.host}`);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Batch indexing failed:", message);

    // Surface PERMISSION_DENIED specifically — the raw error message already
    // contains the actionable hint injected by pushToGoogleIndexing.
    const userFacingError = message.startsWith("PERMISSION_DENIED:")
      ? message.replace("PERMISSION_DENIED: ", "")
      : `Batch indexing failed: ${message}`;

    await Promise.all(nonIndexedUrls.map((url) =>
      db.insert(indexingRequests).values({
        userId: session.user.id,
        domainId: args.domainId,
        url,
        provider: args.provider,
        status: "failed",
        error: message,
      })
    ));

    return { error: userFacingError };
  }
}


/**
 * Get the indexing quota usage in the last 24 hours.
 */
export async function getIndexingUsageAction(): Promise<{
  googleCount: number;
  indexNowCount: number;
}> {
  try {
    const session = await getRequiredSession();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const requests = await db
      .select({
        provider: indexingRequests.provider,
        status: indexingRequests.status,
      })
      .from(indexingRequests)
      .where(
        and(
          eq(indexingRequests.userId, session.user.id),
          eq(indexingRequests.status, "completed"),
          gte(indexingRequests.createdAt, oneDayAgo)
        )
      );

    const googleCount = requests.filter(r => r.provider === "google").length;
    const indexNowCount = requests.filter(r => r.provider === "indexnow").length;

    return { googleCount, indexNowCount };
  } catch (err) {
    console.error("Failed to fetch indexing quota:", err);
    return { googleCount: 0, indexNowCount: 0 };
  }
}


