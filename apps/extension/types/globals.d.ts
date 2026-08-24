/**
 * Ambient globals for the browser extension.
 *
 * This package had `"typecheck": "true"` and no `lint` script, so nothing ever
 * analysed it: the only static analysis in this repo is `tsc`, and the extension
 * opted out of both entry points. It is now checked with allowJs + checkJs, and
 * these are the two globals that check cannot otherwise know about.
 */

/**
 * MV3 extension APIs. Typed as `any` on purpose: pulling in @types/chrome would
 * add a dependency and a version to keep in step with the manifest for no gain
 * here, since every call site is a message-passing shim. The value of checkJs in
 * this package is unresolved identifiers, arity and shape errors in OUR code,
 * not fidelity to the Chrome API surface.
 */
declare const chrome: any;

/**
 * Build-time constant substituted by `bun build --define PSEOLINT_MCP_BRIDGE=...`
 * in the `build` / `build:dev` scripts. It exists only after bundling, so it has
 * to be declared for the unbundled sources to typecheck.
 */
declare const PSEOLINT_MCP_BRIDGE: boolean;
