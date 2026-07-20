---
"@pseolint/core": patch
"pseolint": patch
---

Harden the CrUX field-data path for `tech/core-web-vitals`:

- **Pooled fetching.** Origin and per-URL CrUX lookups now run with bounded concurrency instead of one sequential round-trip at a time — removes a multi-second-per-audit wall-clock regression on keyed runs.
- **`--crux-max-lookups 0` now means unlimited**, matching the `0 = all` convention of `--sample-size` / `--max-per-template` (previously `0` disabled per-URL lookups entirely).
- **Per-metric field/lab selection.** The rule now prefers field data per metric and falls back to the lab render for any metric CrUX lacks, so enabling `--crux-api-key` can no longer drop an LCP/CLS signal the lab render already had.
- **Origin-level findings collapse.** A site-wide origin p75 reading emits one finding (with the affected-page count) instead of an identical finding per page — no more N-way duplication in output or scoring. Origin-level readings are reported at `medium` confidence (site aggregate applied to a page); only per-URL field readings are `high`.
- **Operational errors surface.** 429 (rate-limit), 401/403 (bad key), 5xx, and network/timeout are reported via a warning instead of being silently swallowed as "no field data" (a genuine 404 stays silent — it really does mean no data).
- **Form factor.** New `--crux-form-factor phone|desktop|all` (and `crux.formFactor`) queries the mobile-first field data Google actually ranks on; defaults to `all`.
