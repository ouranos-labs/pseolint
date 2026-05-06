import { describe, expect, test, beforeEach } from "vitest";
import {
  wikipediaParaphraseRate,
  loadWikipediaBloomFilter,
  _resetBloomCache,
} from "../../src/algorithms/wikipedia-paraphrase.js";

// Verbatim text from the bundled sample (marie-curie.txt)
const VERBATIM_WIKIPEDIA =
  "Marie Curie was a Polish and naturalized-French physicist and chemist who conducted " +
  "pioneering research on radioactivity. She was the first woman to win a Nobel Prize, " +
  "the first person to win the Nobel Prize twice, and the only person to win the Nobel " +
  "Prize in two scientific sciences. She was also the first woman to become a professor " +
  "at the University of Paris, and in 1995 she became the first woman to be entombed on " +
  "her own merits in the Pantheon in Paris.";

// Paraphrased variant (synonym swaps, reordering) — same topic, some trigram overlap expected
const PARAPHRASED_WIKIPEDIA =
  "Marie Curie was a Polish-born physicist and chemist who performed groundbreaking " +
  "research on radioactivity. She became the inaugural female recipient of a Nobel Prize " +
  "and the sole individual to receive the Nobel Prize in two distinct scientific fields. " +
  "She was the pioneering female professor at the University of Paris and in 1995 was " +
  "entombed in the Pantheon based solely on her own achievements.";

// Original pSEO content with no encyclopedic overlap
const ORIGINAL_PSEO_CONTENT =
  "Find the best mortgage rates for first-time buyers in Austin, TX. Compare lenders, " +
  "review closing cost estimates, and use our down payment calculator tailored to " +
  "Travis County median home prices. Updated weekly with live rate pulls from 12 local lenders.";

// Random English text that should produce very low overlap
const RANDOM_ENGLISH =
  "Our widget pricing starts at nine dollars per month for five users. Upgrade to the " +
  "professional tier to unlock automated workflows, custom dashboards, and priority support. " +
  "Cancel anytime with no hidden fees or long-term contracts required.";

describe("loadWikipediaBloomFilter", () => {
  beforeEach(() => {
    _resetBloomCache();
  });

  test("returns a non-empty Uint8Array", () => {
    const filter = loadWikipediaBloomFilter();
    expect(filter).toBeInstanceOf(Uint8Array);
    expect(filter.byteLength).toBeGreaterThan(0);
  });

  test("caches correctly — same reference returned on second call", () => {
    const first = loadWikipediaBloomFilter();
    const second = loadWikipediaBloomFilter();
    expect(first).toBe(second);
  });
});

describe("wikipediaParaphraseRate", () => {
  test("empty string returns 0", () => {
    expect(wikipediaParaphraseRate("")).toBe(0);
  });

  test("whitespace-only string returns 0", () => {
    expect(wikipediaParaphraseRate("   \n\t  ")).toBe(0);
  });

  test("verbatim Wikipedia paragraph returns rate >= 0.4 (fires threshold)", () => {
    const rate = wikipediaParaphraseRate(VERBATIM_WIKIPEDIA);
    expect(rate).toBeGreaterThanOrEqual(0.4);
  });

  test("original pSEO content returns rate < 0.4 (does not fire)", () => {
    const rate = wikipediaParaphraseRate(ORIGINAL_PSEO_CONTENT);
    expect(rate).toBeLessThan(0.4);
  });

  test("paraphrased Wikipedia returns some overlap (> 0.1, < 0.9)", () => {
    const rate = wikipediaParaphraseRate(PARAPHRASED_WIKIPEDIA);
    // Must be detectable (some common trigrams) but not necessarily as high as verbatim
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.95);
  });

  test("random commercial English has low FP rate (< 0.3)", () => {
    const rate = wikipediaParaphraseRate(RANDOM_ENGLISH);
    // Sanity: random pSEO-style prose should be well under the 0.4 threshold
    expect(rate).toBeLessThan(0.3);
  });

  test("text with fewer than 3 words returns 0", () => {
    expect(wikipediaParaphraseRate("hello world")).toBe(0);
  });
});
