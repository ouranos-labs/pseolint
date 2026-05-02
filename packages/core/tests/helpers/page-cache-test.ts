import { PageCache, withPageCache } from "../../src/ai/orchestrator/page-cache.js";

/**
 * Test ergonomics: build a single-page cache, run `fn` inside `withPageCache`,
 * yield the `pageId` so the test body can pass it into the tool.
 *
 * Usage:
 * ```ts
 * await withCachedPage("https://example.com/x", "<html>...</html>", async (pageId) => {
 *   const r = await someTool.run({ pageId });
 *   expect(r.ok).toBe(true);
 * });
 * ```
 */
export async function withCachedPage(
  url: string,
  html: string,
  fn: (pageId: string) => Promise<void>,
  status = 200,
  headers: Record<string, string> = {},
): Promise<void> {
  const cache = new PageCache();
  const pageId = cache.put({ url, html, status, headers });
  await withPageCache(cache, () => fn(pageId));
}

/**
 * Multi-page variant. Pages are cached in array order; the resolved
 * pageIds are passed in the same order.
 */
export async function withCachedPages(
  pages: Array<{ url: string; html: string }>,
  fn: (pageIds: string[]) => Promise<void>,
): Promise<void> {
  const cache = new PageCache();
  const pageIds = pages.map((p) =>
    cache.put({ url: p.url, html: p.html, status: 200, headers: {} }),
  );
  await withPageCache(cache, () => fn(pageIds));
}
