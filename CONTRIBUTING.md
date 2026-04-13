# Contributing

Thanks for helping build `pseolint`.

## Development

1. Install dependencies: `bun install`
2. Build all workspaces: `bun run build`
3. Run checks: `bun run lint && bun run test`

## Workspace Rules

- Keep package boundaries clean (`core` -> `cli` -> `action`).
- Add tests for behavior changes.
- Use Changesets for versioned changes.

## License Model

- `packages/*` are MIT-licensed.
- `apps/web` is AGPL-3.0-licensed.
