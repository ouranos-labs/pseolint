const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALL_DIGITS_RE = /^\d+$/;

function generalizeSegment(seg: string): string {
  if (!seg) return seg;
  if (ALL_DIGITS_RE.test(seg)) return ":num";
  if (UUID_RE.test(seg) || ULID_RE.test(seg)) return ":id";
  if (DATE_RE.test(seg)) return ":date";
  const hyphenCount = (seg.match(/-/g) ?? []).length;
  if (hyphenCount >= 2) return ":slug";
  return seg;
}

export function inferUrlTemplate(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  if (pathname === "" || pathname === "/") return "/";
  const trimmed = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const segments = trimmed.split("/").slice(1).map(generalizeSegment);
  return "/" + segments.join("/");
}

/**
 * Mulberry32 PRNG: tiny, fast, statistically adequate for stratified sampling
 * (we don't need cryptographic strength). Returns a deterministic float in
 * [0, 1) given a seeded state. Used so that `auditSource(url, { sampleSeed })`
 * picks the same sample on repeated runs — calibration runs and CI gates need
 * reproducible verdicts.
 */
export function mulberry32(seed: number): () => number {
  let state = (seed | 0) >>> 0;
  return function () {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYates<T>(items: T[], n: number, random: () => number = Math.random): T[] {
  const arr = [...items];
  const out: T[] = [];
  for (let i = 0; i < n && arr.length > 0; i += 1) {
    const idx = Math.floor(random() * arr.length);
    out.push(arr[idx]);
    arr.splice(idx, 1);
  }
  return out;
}

export function stratifiedSample(urls: string[], n: number, random: () => number = Math.random): string[] {
  if (n <= 0 || n >= urls.length) return [...urls];
  const clusters = new Map<string, string[]>();
  for (const u of urls) {
    const t = inferUrlTemplate(u);
    let arr = clusters.get(t);
    if (!arr) { arr = []; clusters.set(t, arr); }
    arr.push(u);
  }
  if (clusters.size <= 1) return fisherYates(urls, n, random);

  const entries = [...clusters.values()];
  const sqrtSizes = entries.map(e => Math.sqrt(e.length));
  const sqrtSum = sqrtSizes.reduce((a, b) => a + b, 0);

  const allocations = sqrtSizes.map(s => Math.floor((s / sqrtSum) * n));
  if (n >= entries.length) {
    for (let i = 0; i < allocations.length; i += 1) {
      if (allocations[i] === 0) allocations[i] = 1;
    }
  }
  for (let i = 0; i < allocations.length; i += 1) {
    allocations[i] = Math.min(allocations[i], entries[i].length);
  }
  let total = allocations.reduce((a, b) => a + b, 0);
  while (total < n) {
    const candidates = allocations
      .map((a, i) => ({ idx: i, slack: entries[i].length - a }))
      .filter(x => x.slack > 0);
    if (candidates.length === 0) break;
    const chosen = candidates[Math.floor(random() * candidates.length)];
    allocations[chosen.idx] += 1;
    total += 1;
  }

  const result: string[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    result.push(...fisherYates(entries[i], allocations[i], random));
  }
  return result;
}
