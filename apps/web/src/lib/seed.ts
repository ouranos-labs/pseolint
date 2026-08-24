/**
 * Stable, dependency-free host→seed hashing for deterministic page sampling.
 *
 * Monitored-domain audits pass `sampleSeed: hashToInt(host)` to the engine so
 * that repeated runs of the same domain sample the same pages: the resulting
 * diff then reflects real content change, not stratified-sampling variance.
 * Public one-shot audits omit the seed (single run; variance is irrelevant).
 */

/**
 * FNV-1a 32-bit hash of `s`, returned as an unsigned integer. Pure and stable:
 * the same input always yields the same output, distinct inputs almost always
 * differ. Suitable as the integer seed for core's stratified-sampler PRNG.
 */
export function hashToInt(s: string): number {
  // FNV-1a 32-bit: offset basis 2166136261, prime 16777619.
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    // Multiply by the FNV prime using 32-bit overflow-safe arithmetic.
    hash = Math.imul(hash, 0x01000193);
  }
  // Coerce to unsigned 32-bit.
  return hash >>> 0;
}
