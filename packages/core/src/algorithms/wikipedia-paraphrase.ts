/**
 * wikipedia-paraphrase.ts
 *
 * Loads the prebuilt Wikipedia trigram bloom filter and provides a
 * paraphrase-rate estimator. Used by content/wikipedia-paraphrase rule.
 *
 * Bloom filter layout (data/wikipedia-trigrams.bin):
 *   m = 65536 bits  (8192 bytes)
 *   k = 3 FNV-1a-32 hash functions with distinct seeds
 *
 * FP rate ~5% for the curated corpus of ~10 k unique trigrams.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "wikipedia-trigrams.bin");

const BLOOM_BITS = 65536;
const BLOOM_K = 3;
const FNV_PRIME = 0x01000193;
const FNV_SEEDS = [0x811c9dc5, 0x6b43a9b5, 0x29f7b4e3];

function fnv1a32(str: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}

let _cache: Uint8Array | null = null;

/** Load and cache the bloom filter binary. */
export function loadWikipediaBloomFilter(): Uint8Array {
  if (_cache !== null) return _cache;
  const buf = readFileSync(DATA_PATH);
  _cache = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return _cache;
}

function bloomQuery(bits: Uint8Array, trigram: string): boolean {
  for (let k = 0; k < BLOOM_K; k++) {
    const pos = fnv1a32(trigram, FNV_SEEDS[k]) % BLOOM_BITS;
    if ((bits[pos >> 3] & (1 << (pos & 7))) === 0) return false;
  }
  return true;
}

function extractTrigrams(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const trigrams: string[] = [];
  for (let i = 0; i <= tokens.length - 3; i++) {
    trigrams.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }
  return trigrams;
}

/**
 * Compute the fraction of the text's trigrams that match the Wikipedia
 * bloom filter. Returns a 0-1 ratio. Returns 0 for text with fewer than
 * 3 words (no trigrams extractable).
 */
export function wikipediaParaphraseRate(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  const trigrams = extractTrigrams(text);
  if (trigrams.length === 0) return 0;
  const bits = loadWikipediaBloomFilter();
  let matched = 0;
  for (const t of trigrams) {
    if (bloomQuery(bits, t)) matched++;
  }
  return matched / trigrams.length;
}

/** Reset the in-memory cache. For testing purposes only. */
export function _resetBloomCache(): void {
  _cache = null;
}
