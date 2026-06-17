# pseolint extension — Publishing & security runbook

Build-seq step 6 (`docs/extension-architecture.md` §10). A privileged extension
with auto-update is a prime supply-chain target; as a solo maintainer the whole
blast radius is on you. Do these **before the first public listing**.

## Account hardening
- **Chrome Web Store account on a hardware key (FIDO2/WebAuthn).** Not TOTP, not
  SMS. This account is the crown jewel — whoever holds it can push code to every
  install under your name.
- Separate, dedicated Google account for the listing (not your daily account).
- Record the publisher account recovery details in your password manager only.

## Build & publish from CI, never a laptop
- Publish only from a **locked CI job** (extend `.github/workflows`), never `bun
  run build` on a dev machine.
- **Reproducible build:** the job builds from a tagged commit; the shipped `.zip`
  must be diffable against `apps/extension/` at that tag. Keep the bundle
  inspectable (we ship readable IIFE, no minify-mangle that hides intent).
- Gate publish on `bun run test` (10 checks) + the no-leak grep
  (`cheerio|node:|__require` → 0 in every `dist/*.js`).
- Store the Web Store API refresh token as a CI secret; rotate after any exposure.

## Dependencies
- The bundle has **zero runtime deps** today (core Tier-1 rules inline, ~478B
  each; verified by the leak grep). Keep it that way — every package would run in
  users' authenticated browsers under your name.
- Lockfile committed; scope CVE scanning (Dependabot/Snyk) to `apps/extension`.
- Pin `chrome-devtools-mcp`-style dev tooling; it never ships in the bundle.

## Pre-publish checklist
- [ ] `bun run build` reproducible from the release tag; `dist/` diff matches source.
- [ ] `bun run test` green (10); leak grep = 0 across all bundles.
- [ ] `manifest.json`: default requests **no** permission; only `sidePanel` +
      `https://www.google.com/search*` standing, `https://*/*` optional/gesture.
- [ ] `PRIVACY.md` hosted at a real URL; store data-safety form matches it exactly.
- [ ] Icons present (`icons/icon-128.png`); store screenshots captured.
- [ ] Privacy/behaviour parity: the listing claims nothing the code doesn't do.

## Credential-compromise runbook (write it BEFORE you need it)
If the publisher account or CI token is suspected compromised:
1. **Pull the listing** — Web Store dashboard → unpublish (stops new installs).
2. **Revoke + rotate** — kill the CI refresh token, rotate the FIDO2-protected
   account credentials, audit recent publish history for an unauthorized version.
3. **Notify users** — post an advisory (GitHub release + site banner) naming the
   bad version range and what to do (remove/reinstall the clean build).
4. **Roll a clean build** — publish a known-good version from CI off a verified tag.
5. **Post-mortem** — how the credential leaked; close that path before re-listing.

## Manual functional verification (until CI/MCP can load the unpacked build)
Automated load via chrome-devtools MCP needs its server started with
`--categoryExtensions`; in your own Chrome it's faster and dodges Google's
anti-bot wall. After `bun run build`:
1. `chrome://extensions` → Developer mode → Load unpacked → `apps/extension`.
2. Open `https://www.google.com/search?q=<anything>` → the landscape chip +
   blue `templated` markers appear automatically, **no permission prompt**.
3. Click the toolbar icon → the **side panel** opens (no popup).
4. Click **Deep scan** → grant the prompt → progress → red/amber risk badges on
   results + a coverage line + flagged list in the panel.
5. Click a badge / "full audit" → opens `pseolint.dev/?prefill=<result>`.
