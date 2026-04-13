import type { ParsedPage, RuleResult } from "../../types.js";
import { clusterKeyForUrl } from "./cluster-key.js";

function hasCrossClusterInbound(
  clusterDir: string,
  urlsInCluster: Set<string>,
  pages: ParsedPage[],
  knownUrls: Set<string>
): boolean {
  for (const page of pages) {
    if (urlsInCluster.has(page.url)) {
      continue;
    }
    for (const link of page.resolvedHrefs) {
      if (!knownUrls.has(link)) {
        continue;
      }
      if (urlsInCluster.has(link)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Flags clusters (same parent directory) with 2+ pages that are siloed: no outbound
 * internal crawl link to another cluster and no inbound from another cluster.
 */
export function clusterConnectivityRule(
  pages: ParsedPage[],
  knownUrls: Set<string>
): RuleResult[] {
  if (pages.length < 2) {
    return [];
  }

  const clusterPages = new Map<string, Set<string>>();
  for (const p of pages) {
    const key = clusterKeyForUrl(p.url);
    const set = clusterPages.get(key) ?? new Set<string>();
    set.add(p.url);
    clusterPages.set(key, set);
  }

  if (clusterPages.size < 2) {
    return [];
  }

  const findings: RuleResult[] = [];

  for (const [clusterDir, urls] of clusterPages.entries()) {
    if (urls.size < 2) {
      continue;
    }

    let hasCrossClusterOutbound = false;
    for (const page of pages) {
      if (!urls.has(page.url)) {
        continue;
      }
      for (const link of page.resolvedHrefs) {
        if (!knownUrls.has(link)) {
          continue;
        }
        const targetCluster = clusterKeyForUrl(link);
        if (targetCluster !== clusterDir) {
          hasCrossClusterOutbound = true;
          break;
        }
      }
      if (hasCrossClusterOutbound) {
        break;
      }
    }

    const hasInbound = hasCrossClusterInbound(clusterDir, urls, pages, knownUrls);

    if (!hasCrossClusterOutbound && !hasInbound) {
      findings.push({
        ruleId: "links/cluster-connectivity",
        severity: "warning",
        message: `Cluster ${clusterDir} (${urls.size} pages) has no crawl links to or from other clusters.`,
        relatedUrls: Array.from(urls).sort()
      });
    }
  }

  return findings;
}
