import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  slugifyDomain,
  parseRepoSlug,
  renderPrBody,
  runApplyPrCommand,
  type PrDeps,
} from "../src/commands/apply-pr.js";

describe("slugifyDomain", () => {
  it("strips protocol/path and slugifies", () => {
    expect(slugifyDomain("https://Foo.Example.com/bar")).toBe("foo-example-com");
    expect(slugifyDomain("acme.io")).toBe("acme-io");
  });
});

describe("parseRepoSlug", () => {
  it("handles ssh and https, with and without .git", () => {
    expect(parseRepoSlug("git@github.com:ouranos-labs/pseolint.git")).toBe("ouranos-labs/pseolint");
    expect(parseRepoSlug("https://github.com/ouranos-labs/pseolint")).toBe("ouranos-labs/pseolint");
    expect(parseRepoSlug("https://github.com/ouranos-labs/pseolint.git/")).toBe("ouranos-labs/pseolint");
    expect(parseRepoSlug("not a url")).toBe(null);
  });
});

describe("renderPrBody", () => {
  it("lists applied files and a task list of checklist items", () => {
    const body = renderPrBody("acme.io", 2, ["a.tsx", "b.tsx"], [
      { kind: "generative", title: "Write FAQ", reason: "aeo", path: "a.tsx" },
    ]);
    expect(body).toContain("**2 deterministic edits**");
    expect(body).toContain("`a.tsx`");
    expect(body).toContain("- [ ] **generative**: Write FAQ — `a.tsx`");
  });
});

const MANIFEST = {
  manifest: {
    domain: "example.com",
    verdict: "caution",
    categories: { integrity: "C", discoverability: "B", citation: "D", data: "C" },
    pages: [
      {
        url: "https://example.com/listing/acme",
        changes: [{ type: "rewrite_meta", field: "title", before: "Old title", after: "New title", reason: "thin" }],
      },
    ],
    templates: [],
    domainLevel: [],
  },
};

describe("runApplyPrCommand", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "pseolint-pr-"));
    await mkdir(join(tmp, "app/listing/[slug]"), { recursive: true });
    await mkdir(join(tmp, ".pseolint"), { recursive: true });
    await writeFile(join(tmp, "app/listing/[slug]/page.tsx"), 'const m = { title: "Old title" };\n', "utf8");
    await writeFile(join(tmp, ".pseolint/templates.json"), JSON.stringify({ "/listing/:slug": "app/listing/[slug]/page.tsx" }), "utf8");
    await writeFile(join(tmp, "manifest.json"), JSON.stringify(MANIFEST), "utf8");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  function fakeDeps(gitLog: string[][]): PrDeps {
    return {
      git: async (args) => {
        gitLog.push(args);
        if (args[0] === "status") return ""; // clean tree
        if (args[0] === "remote") return "git@github.com:ouranos-labs/pseolint.git";
        if (args[0] === "rev-parse") return "origin/main";
        return "";
      },
      api: async (method, url) => {
        if (method === "GET") return { status: 200, json: [] }; // no existing PR
        return { status: 201, json: { html_url: "https://github.com/o/r/pull/1", number: 1 } };
      },
    };
  }

  it("applies, commits, pushes, and opens a PR", async () => {
    const gitLog: string[][] = [];
    const code = await runApplyPrCommand(
      { manifestPath: join(tmp, "manifest.json"), repo: tmp, token: "t", noColor: true },
      fakeDeps(gitLog),
    );
    expect(code).toBe(0);
    const verbs = gitLog.map((a) => a[0]);
    expect(verbs).toEqual(["status", "remote", "rev-parse", "checkout", "add", "commit", "push"]);
    // The clean-tree gate must ignore untracked files (e.g. the manifest itself),
    // else the documented orchestrate --manifest-out … && apply … --pr flow refuses.
    expect(gitLog[0]).toEqual(["status", "--porcelain", "--untracked-files=no"]);
    expect(gitLog.find((a) => a[0] === "checkout")).toEqual(["checkout", "-B", "pseolint/fix-example-com"]);
    expect(gitLog.find((a) => a[0] === "push")).toContain("--force-with-lease");
  });

  it("refuses when the working tree is dirty", async () => {
    const deps = fakeDeps([]);
    deps.git = async (args) => (args[0] === "status" ? " M some-file\n" : "");
    const code = await runApplyPrCommand(
      { manifestPath: join(tmp, "manifest.json"), repo: tmp, token: "t", noColor: true },
      deps,
    );
    expect(code).toBe(1);
  });

  it("no-ops (exit 0, no PR) when nothing applied", async () => {
    // A manifest whose only edit can't match → 0 changedFiles.
    await writeFile(join(tmp, "app/listing/[slug]/page.tsx"), "const m = { title: 'unrelated' };\n", "utf8");
    const gitLog: string[][] = [];
    const code = await runApplyPrCommand(
      { manifestPath: join(tmp, "manifest.json"), repo: tmp, token: "t", noColor: true },
      fakeDeps(gitLog),
    );
    expect(code).toBe(0);
    expect(gitLog.map((a) => a[0])).toEqual(["status"]); // never reached commit/push
  });

  it("fails without a token", async () => {
    const prev = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const code = await runApplyPrCommand(
      { manifestPath: join(tmp, "manifest.json"), repo: tmp, noColor: true },
      fakeDeps([]),
    );
    expect(code).toBe(1);
    if (prev !== undefined) process.env.GITHUB_TOKEN = prev;
  });
});
