/**
 * build-wikipedia-bloom.ts
 *
 * Reads curated Wikipedia sample text from scripts/wikipedia-samples/,
 * extracts word trigrams, builds a minimal bloom filter, and writes
 * the binary to data/wikipedia-trigrams.bin.
 *
 * Run: bun run scripts/build-wikipedia-bloom.ts
 *
 * Bloom filter parameters:
 *   m = 65536 bits (8 KB)
 *   k = 3 hash functions (FNV-1a variants with different seeds)
 * Target FP rate ~5% for the curated corpus size (~10k trigrams).
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(__dirname, "wikipedia-samples");
const OUT_PATH = join(__dirname, "..", "data", "wikipedia-trigrams.bin");

// Bloom filter: 8 KB = 65536 bits, 3 hash functions
const BLOOM_BITS = 65536;
const BLOOM_K = 3;
const BLOOM_BYTES = BLOOM_BITS >> 3; // 8192

// FNV-1a 32-bit with different offset bases as hash seeds
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

function bloomSet(bits: Uint8Array, trigram: string): void {
  for (let k = 0; k < BLOOM_K; k++) {
    const pos = fnv1a32(trigram, FNV_SEEDS[k]) % BLOOM_BITS;
    bits[pos >> 3] |= 1 << (pos & 7);
  }
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

function buildBloomFilter(): Uint8Array {
  const bits = new Uint8Array(BLOOM_BYTES);
  const files = readdirSync(SAMPLES_DIR).filter(
    (f) => f.endsWith(".txt")
  );

  let totalTrigrams = 0;
  const uniqueTrigrams = new Set<string>();

  for (const file of files) {
    const text = readFileSync(join(SAMPLES_DIR, file), "utf-8");
    const trigrams = extractTrigrams(text);
    for (const t of trigrams) {
      uniqueTrigrams.add(t);
    }
    totalTrigrams += trigrams.length;
    process.stdout.write(`  Processed ${file}: ${trigrams.length} trigrams\n`);
  }

  for (const t of uniqueTrigrams) {
    bloomSet(bits, t);
  }

  process.stdout.write(
    `\nBloom filter built:\n` +
    `  Files: ${files.length}\n` +
    `  Total trigrams (with duplicates): ${totalTrigrams}\n` +
    `  Unique trigrams: ${uniqueTrigrams.size}\n` +
    `  Bloom bits: ${BLOOM_BITS} (${BLOOM_BYTES} bytes)\n` +
    `  k (hash functions): ${BLOOM_K}\n`
  );

  return bits;
}

const bits = buildBloomFilter();
writeFileSync(OUT_PATH, bits);
process.stdout.write(`Written: ${OUT_PATH} (${bits.byteLength} bytes)\n`);
