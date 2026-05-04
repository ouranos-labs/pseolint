/**
 * v0.6 Template Detection — Phase 1 of the audit-as-template pipeline.
 *
 * Clusters discovered URLs by path template, filters to qualifying clusters
 * (ratio ≥ 1% AND count ≥ 5), and returns TemplateCandidate[] with each
 * cluster's signature, URL list, and coverage metadata.
 *
 * Activation gating: callers must check that ≥ 2 candidates survive before
 * switching from the legacy single-template path.
 *
 * See spec §6.1 and §15.3.
 */

import { clusterUrlTemplates } from "./site-classifier.js";

/** Minimum cluster ratio to qualify as a template (1% of total URLs). */
const MIN_CLUSTER_RATIO = 0.01;

/** Minimum URL count to qualify as a template. */
const MIN_CLUSTER_COUNT = 5;

/** Synthetic signature for the long-tail bucket. */
export const LONGTAIL_SIGNATURE = "_longtail";

/** A qualifying URL-template cluster. */
export interface TemplateCandidate {
  /** Normalized path pattern, e.g. "/listing/:slug" */
  signature: string;
  /** All URLs in the discovered set belonging to this cluster. */
  urls: string[];
  /** Count of URLs in this cluster. */
  count: number;
  /** Ratio of URLs in this cluster vs total discovered. */
  ratio: number;
}

/**
 * Detect qualifying URL templates from a list of discovered URLs.
 *
 * Returns TemplateCandidate[] for clusters meeting the 1% ratio AND count-5
 * thresholds. URLs not matching any qualifying cluster are grouped into a
 * synthetic "_longtail" candidate (when at least one URL falls through).
 *
 * A URL is attributed to the FIRST qualifying cluster whose signature matches
 * (clusters are sorted by descending count, so the most specific/largest
 * cluster wins in the case of ambiguity — though URL-to-template mapping is
 * injective: one URL → exactly one normalized template).
 */
export function detectTemplates(urls: string[]): TemplateCandidate[] {
  if (urls.length === 0) return [];

  const clusters = clusterUrlTemplates(urls);
  const total = urls.length;

  // Filter to qualifying clusters.
  const qualifying = clusters.filter(
    (c) => c.ratio >= MIN_CLUSTER_RATIO && c.count >= MIN_CLUSTER_COUNT,
  );

  if (qualifying.length === 0) return [];

  // Build a signature → TemplateCandidate map for qualifying clusters.
  const qualifyingSignatures = new Set(qualifying.map((c) => c.template));

  // Re-assign each URL to its cluster (clusterUrlTemplates only gives counts,
  // not the URL lists).
  const urlsBySignature = new Map<string, string[]>();
  for (const sig of qualifyingSignatures) {
    urlsBySignature.set(sig, []);
  }
  const longtailUrls: string[] = [];

  for (const url of urls) {
    const sig = urlToNormalizedTemplate(url);
    if (sig !== null && qualifyingSignatures.has(sig)) {
      urlsBySignature.get(sig)!.push(url);
    } else {
      longtailUrls.push(url);
    }
  }

  const candidates: TemplateCandidate[] = qualifying.map((c) => ({
    signature: c.template,
    urls: urlsBySignature.get(c.template) ?? [],
    count: c.count,
    ratio: c.ratio,
  }));

  // Append long-tail bucket when URLs didn't match any qualifying cluster.
  if (longtailUrls.length > 0) {
    candidates.push({
      signature: LONGTAIL_SIGNATURE,
      urls: longtailUrls,
      count: longtailUrls.length,
      ratio: longtailUrls.length / total,
    });
  }

  return candidates;
}

/**
 * Given a list of TemplateCandidate[] (as returned by detectTemplates),
 * build a lookup map from URL → template signature for fast per-finding tagging.
 *
 * Long-tail URLs map to LONGTAIL_SIGNATURE.
 */
export function buildUrlToTemplateMap(candidates: TemplateCandidate[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const candidate of candidates) {
    for (const url of candidate.urls) {
      map.set(url, candidate.signature);
    }
  }
  return map;
}

/**
 * Check whether the v0.6 template path should activate.
 * Requires ≥ 2 QUALIFYING (non-longtail) templates per §15.3.
 */
export function shouldActivateTemplateScoring(candidates: TemplateCandidate[]): boolean {
  const qualifying = candidates.filter((c) => c.signature !== LONGTAIL_SIGNATURE);
  return qualifying.length >= 2;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Re-implement URL → normalized template. Mirrors normalizePathToTemplate from site-classifier. */
function urlToNormalizedTemplate(url: string): string | null {
  try {
    const u = new URL(url);
    return normalizePathToTemplate(u.pathname);
  } catch {
    if (typeof url === "string" && url.length > 0) {
      const path = url.split("?")[0].split("#")[0];
      return normalizePathToTemplate(path);
    }
    return null;
  }
}

function normalizePathToTemplate(pathname: string): string {
  let p = pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (!p.startsWith("/")) p = "/" + p;

  const segments = p.split("/").slice(1);
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "")) {
    return "/";
  }

  const out = segments.map((seg) => {
    if (seg === "") return "";
    if (/^\d+$/.test(seg)) return ":n";
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(seg)) return ":slug";
    if (seg.length >= 12 && /^[a-z]+$/.test(seg)) return ":slug";
    return seg;
  });

  return "/" + out.join("/");
}
