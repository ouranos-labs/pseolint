import type { EntityMaskPattern, ParsedPage } from "../types.js";
import { normalizePathToTemplate } from "../template-detection.js";

export interface DeriveOptions {
  /** Only derive from URL-template clusters with at least this many siblings. */
  minClusterSize?: number; // default 3
  /** Ignore tokens shorter than this. */
  minTokenLength?: number; // default 3
  /** Placeholder substituted for masked entities. */
  placeholder?: string; // default "[ENTITY]"
  /** Enable URL-slug token derivation. */
  urlSlug?: boolean; // default true
  /** Enable capitalized-content-token derivation. */
  contentDiff?: boolean; // default true
  /** Hard cap on total derived tokens (over-masking guard). */
  maxTokens?: number; // default 500
}

type MaskPage = Pick<ParsedPage, "url" | "contentText">;

/** Tiny stopword set so varying function-words never become entities. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "your", "our", "are",
  "you", "all", "new", "best", "top", "how", "what", "why", "who", "about",
  "page", "home", "more", "get", "buy", "free", "online", "now",
]);

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split("?")[0].split("#")[0];
  }
}

function rawSegments(path: string): string[] {
  return path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

/** Tokens from `:slug` path segments only (numeric `:n` segments are not name-entities). */
function urlSlugTokens(path: string): string[] {
  const tmplSegs = normalizePathToTemplate(path).replace(/^\//, "").split("/");
  const raw = rawSegments(path);
  const out: string[] = [];
  tmplSegs.forEach((t, i) => {
    if (t === ":slug" && raw[i]) {
      for (const tok of raw[i].split(/[-_]/)) out.push(tok.toLowerCase());
    }
  });
  return out;
}

const CONTENT_ENTITY_RE = /\b[A-Z][a-zA-Z]{2,}\b/g;
function contentEntityTokens(text: string): string[] {
  return (text.match(CONTENT_ENTITY_RE) ?? []).map((t) => t.toLowerCase());
}

/**
 * Tokens whose presence VARIES across cluster members: present in at least one
 * member but not in all. Constant template vocabulary (in every member) is
 * excluded; per-page entities (in a subset) are kept.
 */
function varyingTokens(perMember: string[][], minLen: number): Set<string> {
  const memberSets = perMember.map(
    (toks) => new Set(toks.filter((t) => t.length >= minLen && !STOPWORDS.has(t))),
  );
  const presence = new Map<string, number>();
  for (const s of memberSets) for (const t of s) presence.set(t, (presence.get(t) ?? 0) + 1);
  const n = memberSets.length;
  const out = new Set<string>();
  for (const [t, c] of presence) if (c >= 1 && c < n) out.add(t);
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function deriveEntityPatterns(pages: ReadonlyArray<MaskPage>, opts?: DeriveOptions): EntityMaskPattern[] {
  const minCluster = opts?.minClusterSize ?? 3;
  const minLen = opts?.minTokenLength ?? 3;
  const placeholder = opts?.placeholder ?? "[ENTITY]";
  const useUrl = opts?.urlSlug ?? true;
  const useContent = opts?.contentDiff ?? true;
  const maxTokens = opts?.maxTokens ?? 500;

  // Cluster pages by normalized URL template.
  const clusters = new Map<string, MaskPage[]>();
  for (const p of pages) {
    const tmpl = normalizePathToTemplate(pathOf(p.url));
    const bucket = clusters.get(tmpl);
    if (bucket) bucket.push(p);
    else clusters.set(tmpl, [p]);
  }

  const entities = new Set<string>();
  for (const members of clusters.values()) {
    if (members.length < minCluster) continue;
    if (useUrl) {
      for (const t of varyingTokens(members.map((m) => urlSlugTokens(pathOf(m.url))), minLen)) entities.add(t);
    }
    if (useContent) {
      for (const t of varyingTokens(members.map((m) => contentEntityTokens(m.contentText ?? "")), minLen)) entities.add(t);
    }
  }

  const tokens = [...entities].sort().slice(0, maxTokens);
  if (tokens.length === 0) return [];

  const CHUNK = 200;
  const patterns: EntityMaskPattern[] = [];
  for (let i = 0; i < tokens.length; i += CHUNK) {
    // Each token is metacharacter-escaped (escapeRegex) and joined into a bounded,
    // backtracking-free alternation `\b(?:a|b|c)\b` — no nested quantifiers, so this
    // dynamic RegExp is ReDoS-safe by construction.
    const alt = tokens.slice(i, i + CHUNK).map(escapeRegex).join("|");
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    patterns.push({ placeholder, pattern: new RegExp(`\\b(?:${alt})\\b`, "gi") });
  }
  return patterns;
}
