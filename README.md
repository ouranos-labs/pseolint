# pseolint

SpamBrain-proof your pSEO before you publish.

## Monorepo

- `packages/core` — `@pseolint/core` audit engine (MIT)
- `packages/cli` — `pseolint` CLI wrapper (MIT)
- `packages/action` — GitHub Action package (MIT)
- `apps/web` — hosted dashboard app (AGPL-3.0)

## Requirements

- Bun `1.2.x`
- Node.js `>=20` (for ecosystem tooling and runtime compatibility)

## Getting Started

```bash
bun install
bun run build
bun run test
```

Run the web app:

```bash
bun --filter @pseolint/web run dev
```

## Release Workflow

Changesets is configured for versioning and publishing:

```bash
bun run changeset
bun run version-packages
bun run release
```
