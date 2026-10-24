/**
 * Mann-Whitney U with tie-corrected normal approximation.
 * Returns AUC = P(a > b) + 0.5·P(a = b): 0.5 = no separation, 1 = every `a`
 * beats every `b`. Non-parametric on purpose: page features (inlinks, word
 * counts) are heavy-tailed, so a t-test would be dominated by a few outliers.
 */
export function mannWhitney(a: number[], b: number[]): { auc: number; p: number } {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) return { auc: 0.5, p: 1 };
  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort((x, y) => x.v - y.v);
  const ranks = new Array<number>(all.length);
  let tieTerm = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = r;
    const t = j - i + 1;
    tieTerm += t * t * t - t;
    i = j + 1;
  }
  let r1 = 0;
  for (let i = 0; i < all.length; i++) if (all[i].g === 0) r1 += ranks[i];
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const auc = u1 / (n1 * n2);
  const n = n1 + n2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1))));
  if (sigma === 0) return { auc, p: 1 };
  const z = (Math.abs(u1 - (n1 * n2) / 2) - 0.5) / sigma;
  return { auc, p: Math.min(1, 2 * (1 - normalCdf(Math.max(0, z)))) };
}

// Abramowitz-Stegun 7.1.26, |error| < 1.5e-7: plenty for a significance gate.
export function normalCdf(z: number): number {
  if (z < 0) return 1 - normalCdf(-z);
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return 0.5 * (1 + y);
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
