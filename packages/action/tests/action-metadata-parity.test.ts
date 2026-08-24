import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(pkgRoot, "../..");

const ROOT_YML = resolve(repoRoot, "action.yml");
const PKG_YML = resolve(pkgRoot, "action.yml");

/** Drop the leading `#` header block and blank padding, so only metadata is compared. */
function stripLeadingComments(text: string): string {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && (lines[i].startsWith("#") || lines[i].trim() === "")) i++;
  return lines.slice(i).join("\n").trim();
}

/** Crude but dependency-free: `key: value` at any depth. Enough for this file's shape. */
function scalar(text: string, key: string): string | null {
  const m = text.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

/**
 * The Marketplace lists ONLY an action whose metadata file sits at the
 * repository root: "Each repository must contain a single action metadata file
 * (action.yml or action.yaml) at the root", and sub-folder metadata files "will
 * not be automatically listed in the marketplace".
 *
 * So this monorepo needs two copies: the root one that Marketplace reads, and
 * packages/action/action.yml, which the action-release workflow publishes to the
 * `action-v1` orphan branch (whose root IS that package). Two copies drift, and
 * a drifted input is a broken action for every consumer, so pin them together.
 * They may differ in exactly one place: `runs.main`, whose path is relative to
 * whichever root the file is published at.
 */
describe("action metadata", () => {
  it("exists at the repository root, or Marketplace will not list it", () => {
    expect(
      existsSync(ROOT_YML),
      "action.yml is missing from the repository root. GitHub Marketplace only " +
        "lists a root-level metadata file; packages/action/action.yml alone is " +
        "invisible to it.",
    ).toBe(true);
  });

  it("is identical to the package copy apart from runs.main", () => {
    const root = stripLeadingComments(readFileSync(ROOT_YML, "utf8"));
    const pkg = stripLeadingComments(readFileSync(PKG_YML, "utf8"));

    const normalise = (s: string) => s.replace(/^\s*main:.*$/m, "  main: <path>");
    expect(normalise(root)).toBe(normalise(pkg));
  });

  it("points each copy at the bundle relative to its own publish root", () => {
    const root = readFileSync(ROOT_YML, "utf8");
    const pkg = readFileSync(PKG_YML, "utf8");

    // Root file is consumed as `uses: ouranos-labs/pseolint@<tag>`, so the path
    // is repo-relative. The package copy ships to a branch whose root is the
    // package itself.
    expect(scalar(root, "main")).toBe('"packages/action/dist/index.js"');
    expect(scalar(pkg, "main")).toBe('"dist/index.js"');
  });

  it("declares a Node runtime GitHub still supports", () => {
    // node16 was removed and node20 is deprecated on current runners; node24 is
    // the supported value per the metadata-syntax reference.
    for (const [label, file] of [["root", ROOT_YML], ["package", PKG_YML]] as const) {
      expect(scalar(readFileSync(file, "utf8"), "using"), `${label} action.yml`).toBe('"node24"');
    }
  });

  it("ships the bundle the root metadata file points at", () => {
    // A tag published to Marketplace runs straight from the committed tree:
    // there is no build step, so a missing bundle is a broken action.
    expect(
      existsSync(resolve(repoRoot, "packages/action/dist/index.js")),
      "packages/action/dist/index.js is absent. The action runs from the " +
        "committed bundle, so it must be built and committed before tagging.",
    ).toBe(true);
  });
});
