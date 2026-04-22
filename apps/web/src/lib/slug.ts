import { customAlphabet } from "nanoid";

// URL-safe alphabet, no look-alikes (no 0/O, 1/l/I)
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

const generate = customAlphabet(ALPHABET, 10);

/**
 * Public slug: 10 chars, URL-safe, ~58 bits of entropy.
 * Use for audit + monitored-domain public identifiers.
 */
export function publicSlug(): string {
  return generate();
}
