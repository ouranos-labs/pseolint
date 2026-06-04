import { z } from "zod";
import { sealSecret, openSecret } from "@/lib/secret-box";

/**
 * Google Indexing API - officially for JobPosting/BroadcastEvent,
 * but widely used for rapid pSEO indexing.
 */
const GOOGLE_INDEXING_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";

/**
 * IndexNow - supported by Bing, Yandex, Seznam, Naver.
 */
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";

export async function pushToGoogleIndexing(url: string, accessToken: string) {
  const res = await fetch(GOOGLE_INDEXING_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      url,
      type: "URL_UPDATED",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // Classify known Google API errors into actionable messages
    if (res.status === 403) {
      let status = "";
      try { 
        const parsed = JSON.parse(body);
        status = parsed?.error?.status ?? ""; 
      } catch { /* ignore */ }
      
      if (status === "PERMISSION_DENIED") {
        throw new Error(
          "PERMISSION_DENIED: Your connected Google account does not have Owner access on this Search Console property. " +
          "The Google Indexing API requires you to be a verified Owner, not just a Full/Restricted user. " +
          "Go to Search Console → Settings → Ownership verification and ensure your account is a verified owner."
        );
      }
    }
    if (res.status === 429) {
      throw new Error("QUOTA_EXCEEDED: Google Indexing API daily quota of 200 requests has been reached. Resets at midnight Pacific Time.");
    }
    throw new Error(`Google Indexing API error ${res.status}: ${body}`);
  }

  return await res.json();
}

export async function pushToIndexNow(host: string, urls: string[], key: string, keyLocation?: string) {
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      host,
      key,
      keyLocation: keyLocation || `https://${host}/${key}.txt`,
      urlList: urls,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`IndexNow API error: ${res.status} ${error}`);
  }

  return { success: true };
}
