/**
 * pseolint config for the pseolint web app itself (dogfood audit).
 *
 * The dogfood audit runs `pseolint http://localhost:3003` to publish a
 * self-audit of pseolint.dev. This config excludes utility routes that
 * aren't marketing content pages so they don't pollute scoring.
 *
 * Important: `ignore` patterns are matched against the FULL URL
 * (e.g. http://localhost:3003/apple-icon), not just the pathname.
 * Patterns must therefore be prefixed with `**` to match across the
 * scheme + host. Reference: tests/integration/auditor.test.ts uses
 * `["**\/api/**"]`.
 *
 * To use: invoke the CLI with `apps/web/` (or a subdirectory) as the cwd:
 * cosmiconfig walks upward from cwd to find this file.
 *
 *   cd apps/web && node ../../packages/cli/dist/cli.js http://localhost:3003
 */
export default {
  ignore: [
    // Next.js auto-generated metadata image routes (return PNG, not HTML)
    "**/apple-icon*",
    "**/icon",
    "**/icon.*",
    "**/icon-*",
    "**/opengraph-image*",
    "**/twitter-image*",

    // Auth + app routes (intentionally noindexed, not marketing content)
    "**/signin*",
    "**/dashboard/**",
    "**/dashboard",

    // API + private surfaces
    "**/api/**",
    "**/r/**", // private audit reports
    "**/a/**", // in-flight audits
  ],
};
