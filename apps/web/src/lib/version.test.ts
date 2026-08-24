import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION } from "./version";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * ENGINE_VERSION is a hand-maintained constant, by design: the hosted app runs
 * the workspace core, which can briefly lead the npm-published package. But
 * hand-maintained means it drifts, and it feeds ten public surfaces including
 * the nav badge and the methodology page. It sat at 0.7.5 while core was 0.8.0
 * because `changeset version` bumps package.json and knows nothing about this
 * file.
 *
 * Pinning it to core's actual version is the cheap guard. If a release
 * deliberately wants the two to differ, this test is the place to say so out
 * loud rather than letting the marketing copy quietly lie.
 *
 * Not resolved via import: @pseolint/core's exports map does not expose
 * ./package.json, so reading the file is the honest way to get it.
 */
describe("ENGINE_VERSION", () => {
  it("matches the version of @pseolint/core the app actually ships", () => {
    const core = JSON.parse(
      readFileSync(resolve(repoRoot, "packages/core/package.json"), "utf8"),
    ) as { version: string };

    expect(
      ENGINE_VERSION,
      `ENGINE_VERSION (${ENGINE_VERSION}) is stale against @pseolint/core ` +
        `(${core.version}). It is shown on the nav badge, /methodology, /limits, ` +
        `/pricing and the rule pages, so a stale value is published copy that is ` +
        `wrong. Bump src/lib/version.ts as part of the release commit.`,
    ).toBe(core.version);
  });
});
