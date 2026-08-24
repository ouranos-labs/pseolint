import { isSafePublicUrl } from "@/lib/ssrf";

export interface OgData {
  title: string | null;
  description: string | null;
  image: string | null;
}

const FETCH_TIMEOUT_MS = 5_000;
/** 256 KB ceiling: every OG <head> ever ships well under this. */
const MAX_BYTES = 256 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (compatible; pseolint-og-fetcher/1.0; +https://pseolint.dev/leaderboard)";

// All regexes are static (no RegExp() with dynamic input) so user-supplied
// HTML can't drive ReDoS via attacker-crafted patterns. Quantifiers are bounded
// by literal terminators (`>`, quote chars, `</head>`) and the input itself is
// truncated to MAX_BYTES upstream.
const HEAD_RE = /<head[^>]*>([\s\S]*?)<\/head>/i;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META_TAG_RE = /<meta\b[^>]*>/gi;
const ATTR_PROPERTY_RE = /\sproperty\s*=\s*["']([^"']*)["']/i;
const ATTR_NAME_RE = /\sname\s*=\s*["']([^"']*)["']/i;
const ATTR_CONTENT_RE = /\scontent\s*=\s*["']([^"']*)["']/i;

interface MetaTag {
  property: string | null;
  name: string | null;
  content: string | null;
}

/**
 * Fetch a URL's homepage HTML head, extract OG/Twitter/meta tags, and resolve
 * any relative og:image to an absolute URL. SSRF-guarded via isSafePublicUrl
 * before fetching, with a hard byte ceiling and abort-timeout. Returns nulls
 * on any failure path so callers can fall through to placeholder UI.
 */
export async function fetchOgMeta(rawUrl: string): Promise<OgData> {
  if (!(await isSafePublicUrl(rawUrl))) return empty();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(rawUrl, {
      signal: ctrl.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.8" },
      redirect: "follow",
    });
    if (!res.ok || !res.body) return empty();

    const html = await readBoundedText(res.body, MAX_BYTES);
    const finalUrl = res.url || rawUrl;

    // Re-validate the final URL after redirect-follow, in case a redirect chain
    // tried to land us on something internal.
    if (!(await isSafePublicUrl(finalUrl))) return empty();

    return parseOgFromHtml(html, finalUrl);
  } catch {
    return empty();
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedText(
  body: ReadableStream<Uint8Array>,
  cap: number,
): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (received < cap) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  const total = Math.min(received, cap);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    if (offset + c.byteLength > total) {
      buf.set(c.subarray(0, total - offset), offset);
      break;
    }
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

function parseOgFromHtml(html: string, baseUrl: string): OgData {
  const headMatch = html.match(HEAD_RE);
  const head = headMatch ? headMatch[1] : html;

  const metas = extractMetas(head);
  const get = (key: string): string | null => {
    const m = metas.find((t) => t.property === key || t.name === key);
    if (!m?.content) return null;
    return decodeHtml(m.content);
  };

  const docTitle = (() => {
    const t = head.match(TITLE_RE)?.[1]?.trim();
    return t ? decodeHtml(t) : null;
  })();

  const ogImage = get("og:image:secure_url") ?? get("og:image");
  const twitterImage = get("twitter:image");

  return {
    title: trim(get("og:title") ?? get("twitter:title") ?? docTitle),
    description: trim(get("og:description") ?? get("twitter:description") ?? get("description")),
    image: resolveUrl(ogImage ?? twitterImage, baseUrl),
  };
}

function extractMetas(head: string): MetaTag[] {
  const out: MetaTag[] = [];
  for (const m of head.matchAll(META_TAG_RE)) {
    const tag = m[0];
    out.push({
      property: tag.match(ATTR_PROPERTY_RE)?.[1] ?? null,
      name: tag.match(ATTR_NAME_RE)?.[1] ?? null,
      content: tag.match(ATTR_CONTENT_RE)?.[1] ?? null,
    });
  }
  return out;
}

function resolveUrl(url: string | null | undefined, base: string): string | null {
  if (!url) return null;
  try {
    const abs = new URL(url, base).toString();
    // Reject non-http(s) schemes (data:, javascript:, etc.) and obviously huge URLs.
    if (!/^https?:\/\//i.test(abs)) return null;
    if (abs.length > 1000) return null;
    return abs;
  } catch {
    return null;
  }
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function trim(s: string | null): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length === 0 ? null : t;
}

function empty(): OgData {
  return { title: null, description: null, image: null };
}
