import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runApplyCommand, applyManifest } from "../src/commands/apply.js";

const MANIFEST = {
  manifest: {
    domain: "example.com",
    verdict: "caution",
    categories: { integrity: "C", discoverability: "B", citation: "D", data: "C" },
    pages: [
      {
        url: "https://example.com/listing/acme",
        changes: [
          { type: "rewrite_meta", field: "title", before: "Old title", after: "New title", reason: "thin" },
          { type: "replace_h1", before: "Best in Austin", after: "Acme in Austin", reason: "entity-swap" },
        ],
      },
    ],
    templates: [],
    domainLevel: [],
  },
};

describe("runApplyCommand", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "pseolint-apply-"));
    await mkdir(join(tmp, "app/listing/[slug]"), { recursive: true });
    await mkdir(join(tmp, ".pseolint"), { recursive: true });
    // Literal title matches; the H1 is interpolated so its `before` won't be found.
    await writeFile(
      join(tmp, "app/listing/[slug]/page.tsx"),
      'const metadata = { title: "Old title" };\nexport default () => <h1>Best in {city}</h1>;\n',
      "utf8",
    );
    await writeFile(
      join(tmp, ".pseolint/templates.json"),
      JSON.stringify({ "/listing/:slug": "app/listing/[slug]/page.tsx" }),
      "utf8",
    );
    await writeFile(join(tmp, "manifest.json"), JSON.stringify(MANIFEST), "utf8");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  const src = () => readFile(join(tmp, "app/listing/[slug]/page.tsx"), "utf8");

  it("applies a matching literal and demotes an interpolated miss instead of corrupting source", async () => {
    const code = await runApplyCommand({ manifestPath: join(tmp, "manifest.json"), repo: tmp, noColor: true });
    expect(code).toBe(0);
    const after = await src();
    expect(after).toContain('title: "New title"'); // literal applied
    expect(after).toContain("<h1>Best in {city}</h1>"); // interpolated H1 untouched (demoted, not corrupted)
  });

  it("dry-run writes nothing", async () => {
    const before = await src();
    await runApplyCommand({ manifestPath: join(tmp, "manifest.json"), repo: tmp, dryRun: true, noColor: true });
    expect(await src()).toBe(before);
  });

  it("fails cleanly when the mapping file is missing", async () => {
    await rm(join(tmp, ".pseolint/templates.json"));
    const code = await runApplyCommand({ manifestPath: join(tmp, "manifest.json"), repo: tmp, noColor: true });
    expect(code).toBe(1);
  });

  it("applyManifest returns the applied edit + demoted miss for the PR opener to consume", async () => {
    const r = await applyManifest({ manifestPath: join(tmp, "manifest.json"), repo: tmp });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied).toBe(1); // title literal applied
    expect(r.changedFiles).toEqual(["app/listing/[slug]/page.tsx"]);
    expect(r.checklist.some((c) => c.kind === "unmapped")).toBe(true); // interpolated H1 demoted
    expect(r.dryRun).toBe(false);
  });

  it("applyManifest surfaces a bad mapping as ok:false with a hint", async () => {
    await rm(join(tmp, ".pseolint/templates.json"));
    const r = await applyManifest({ manifestPath: join(tmp, "manifest.json"), repo: tmp });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("cannot read mapping");
    expect(r.hint).toBeTruthy();
  });
});
