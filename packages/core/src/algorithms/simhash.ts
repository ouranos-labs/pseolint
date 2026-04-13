const SHINGLE_SIZE = 3;
const SIMHASH_BITS = 64;
const MAX_64 = (1n << 64n) - 1n;

function normalizeText(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function buildShingles(tokens: string[]): string[] {
  if (tokens.length < SHINGLE_SIZE) {
    return [tokens.join(" ")];
  }

  const shingles: string[] = [];
  for (let i = 0; i <= tokens.length - SHINGLE_SIZE; i += 1) {
    shingles.push(tokens.slice(i, i + SHINGLE_SIZE).join(" "));
  }
  return shingles;
}

function fnv1a64(value: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (const char of value) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = (hash * prime) & MAX_64;
  }

  return hash;
}

export function simHashFromText(input: string): bigint {
  const tokens = normalizeText(input);
  if (tokens.length === 0) {
    return 0n;
  }
  const shingles = buildShingles(tokens);
  const bitWeights = Array.from({ length: SIMHASH_BITS }, () => 0);

  for (const shingle of shingles) {
    const hash = fnv1a64(shingle);
    for (let bit = 0; bit < SIMHASH_BITS; bit += 1) {
      const isSet = (hash & (1n << BigInt(bit))) !== 0n;
      bitWeights[bit] += isSet ? 1 : -1;
    }
  }

  let fingerprint = 0n;
  for (let bit = 0; bit < SIMHASH_BITS; bit += 1) {
    if (bitWeights[bit] > 0) {
      fingerprint |= 1n << BigInt(bit);
    }
  }

  return fingerprint;
}

export function hammingDistance(left: bigint, right: bigint): number {
  let diff = left ^ right;
  let count = 0;

  while (diff !== 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }

  return count;
}

export function similarityFromDistance(distance: number): number {
  return Math.max(0, (SIMHASH_BITS - distance) / SIMHASH_BITS);
}
