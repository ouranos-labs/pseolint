# Calibration fixtures

Pre-captured HTML fixtures for deterministic calibration of the reputable-pSEO corpus. Each site directory contains stripped HTML from the site's `pinnedUrls` list, allowing `scripts/calibration-reputable-pseo.ts` to audit from disk instead of making network requests.

## Why fixtures exist

The calibration runner (`scripts/calibration-reputable-pseo.ts`) uses `pinnedUrls` to stabilize the URL sample between runs. Fixtures go one step further: the HTML content is frozen on disk, so verdict drift from site redesigns, A/B tests, or transient CDN errors is eliminated. Fixtures make the calibration a true regression test against the engine's rule logic, not against a live website.

## File structure

```
fixtures/
  <host>/
    _manifest.json        # URL → relative filename map (source of truth)
    <sanitized-path>.html # stripped HTML for each pinned URL
    sitemap.xml           # captured if reachable at origin/sitemap.xml
    robots.txt            # captured if reachable at origin/robots.txt
  README.md               # this file
```

The `_manifest.json` maps original URLs to relative filenames:
```json
{
  "https://wise.com/": "index.html",
  "https://wise.com/au/currency-converter": "au_currency-converter.html"
}
```

The engine's directory loader reads `_manifest.json` when present, restoring original URLs so all URL-dependent rules (canonicals, hreflang, link graph) work correctly.

HTML files have `<script>` (non-JSON-LD) and `<style>` blocks stripped to keep file sizes manageable. JSON-LD blocks are preserved because `schema/*` rules depend on them.

## Quarterly refresh workflow

Re-capture all pinned sites:
```sh
bun run scripts/calibration-reputable-pseo.ts --snapshot
```

Refresh a single site (substring filter):
```sh
bun run scripts/calibration-reputable-pseo.ts --snapshot wise
bun run scripts/calibration-reputable-pseo.ts --snapshot numbeo
```

After refresh, run normal calibration to confirm verdicts are stable:
```sh
bun run scripts/calibration-reputable-pseo.ts
bun run scripts/calibration-reputable-pseo.ts  # second run — verdicts must match
```

## Staleness signal

When a site undergoes a major redesign (new template structure, changed title patterns, different JSON-LD schema), the engine's verdict may drift even though no code changed. That verdict drift is the signal to refresh fixtures. If calibration passes before and fails after a scheduled refresh, investigate whether it's a real regression (engine mis-calibration) or just stale site expectations (update `expectedVerdictCeiling`).

## Adding a new fixture set

1. Ensure the site has `pinnedUrls` populated in `reputable-pseo-corpus.json` (run `--repin <filter>` if not)
2. Run `--snapshot <filter>` to capture fixtures
3. Verify with two normal runs that the verdict is stable
4. Commit the fixture directory + updated corpus JSON

## Sites without fixtures

Sites with empty `pinnedUrls` (Zapier, NerdWallet, Webflow, Stripe) continue to use live HTTP fetching. They have no `localFixtureDir` set and fall through to the HTTP path automatically.
