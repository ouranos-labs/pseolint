// Pure summary of a deep-scan result set. `ok` = the page was actually fetched
// and judged; a false "all clear" is impossible because failures count as unscanned.
export function coverage(results) {
  const total = results.length;
  const scanned = results.filter((r) => r.ok).length;
  const flagged = results.filter((r) => r.verdict).length;
  return { total, scanned, failed: total - scanned, flagged };
}
