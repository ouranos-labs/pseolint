/**
 * Single source for the engine version shown in marketing/UI copy. The hosted
 * app runs @pseolint/core at this version (workspace). Bump this ONE line on each
 * engine release so the nav badge, methodology "Engine: vX", and product framing
 * don't drift across dozens of files again.
 *
 * npm-published `pseolint`/`@pseolint/core` may briefly lag this (e.g. a prepped
 * but unpublished bump), so install commands in copy are intentionally UNPINNED
 * (`npx pseolint`, `npm i -g pseolint`) rather than citing a version.
 */
export const ENGINE_VERSION = "0.7.5";
