import type { Fetcher } from "../cache.js";

/**
 * Submits URLs via IndexNow (Bing, Yandex, Seznam, Naver; Bing's index feeds
 * ChatGPT search and DuckDuckGo). Google ignores IndexNow, and its Indexing
 * API is restricted to JobPosting/BroadcastEvent pages, so for Google the
 * lever stays internal links + sitemap lastmod.
 *
 * The key must be served at `https://<host>/<key>.txt` containing the key.
 */
export async function submitIndexNow(
  host: string,
  key: string,
  urls: string[],
  fetcher: Fetcher = globalThis.fetch.bind(globalThis),
): Promise<{ submitted: number; status: number[] }> {
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error("IndexNow key must be 8-128 chars of [a-zA-Z0-9-]");
  const own = urls.filter((u) => {
    try {
      return new URL(u).hostname === host;
    } catch {
      return false;
    }
  });
  const status: number[] = [];
  // Protocol cap is 10,000 URLs per POST.
  for (let i = 0; i < own.length; i += 10_000) {
    const res = await fetcher("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: own.slice(i, i + 10_000) }),
    });
    status.push(res.status);
  }
  return { submitted: own.length, status };
}
