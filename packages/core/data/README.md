# packages/core/data

Binary data files bundled with @pseolint/core.

## wikipedia-trigrams.bin

A prebuilt bloom filter (8 KB) containing word trigrams extracted from a curated
set of 12 Wikipedia articles (biographies, city/country, science, and tech topics).

**Used by**: `src/algorithms/wikipedia-paraphrase.ts` and the
`content/wikipedia-paraphrase` rule to estimate encyclopedic paraphrase rate on
audited pages.

**Bloom filter parameters**:
- m = 65536 bits (8192 bytes)
- k = 3 FNV-1a-32 hash functions with distinct seeds
- Unique trigrams indexed: ~5032 (from 12 Wikipedia sample articles)
- Target false-positive rate: ~5%

**Regenerating**: If you modify files in `scripts/wikipedia-samples/`, run:

```bash
bun run build-wikipedia-bloom
```

This re-reads all `.txt` files in `scripts/wikipedia-samples/`, rebuilds the
bloom filter, and overwrites `data/wikipedia-trigrams.bin`. Commit the updated
binary alongside any corpus changes.

**Licensing**: The sample texts are excerpted from Wikipedia articles licensed
under CC BY-SA 4.0. See `scripts/wikipedia-samples/NOTICE.md` for article URLs
and attribution.
