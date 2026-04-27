import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensurePseolintGitignored } from "../src/ensure-gitignore.js";

describe("ensurePseolintGitignored", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "pseolint-gi-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  async function initRepo(root: string): Promise<void> {
    await mkdir(join(root, ".git"), { recursive: true });
  }

  it("returns no-repo when CWD is not inside a git repo", async () => {
    const result = await ensurePseolintGitignored(tmp);
    expect(result).toEqual({ gitignorePath: null, modified: false, reason: "no-repo" });
  });

  it("returns no-gitignore-file when repo has no .gitignore", async () => {
    await initRepo(tmp);
    const result = await ensurePseolintGitignored(tmp);
    expect(result.modified).toBe(false);
    expect(result.reason).toBe("no-gitignore-file");
  });

  it("appends .pseolint/ block when missing from an existing .gitignore", async () => {
    await initRepo(tmp);
    const gi = join(tmp, ".gitignore");
    await writeFile(gi, "node_modules/\n.env\n", "utf8");
    const result = await ensurePseolintGitignored(tmp);
    expect(result.modified).toBe(true);
    expect(result.reason).toBe("appended");
    const after = await readFile(gi, "utf8");
    expect(after).toContain(".pseolint/");
    expect(after).toContain("node_modules/");
  });

  it("adds trailing newline before block when existing file doesn't end with one", async () => {
    await initRepo(tmp);
    const gi = join(tmp, ".gitignore");
    await writeFile(gi, "node_modules/", "utf8"); // no trailing newline
    await ensurePseolintGitignored(tmp);
    const after = await readFile(gi, "utf8");
    expect(after).toMatch(/node_modules\/\r?\n/);
    expect(after).toContain(".pseolint/");
  });

  it("does not duplicate when .pseolint/ is already ignored", async () => {
    await initRepo(tmp);
    const gi = join(tmp, ".gitignore");
    await writeFile(gi, "node_modules/\n.pseolint/\n", "utf8");
    const result = await ensurePseolintGitignored(tmp);
    expect(result).toMatchObject({ modified: false, reason: "already-ignored" });
    const after = await readFile(gi, "utf8");
    expect(after.match(/\.pseolint/g)?.length).toBe(1);
  });

  it("recognises .pseolint (no trailing slash) as already-ignored", async () => {
    await initRepo(tmp);
    const gi = join(tmp, ".gitignore");
    await writeFile(gi, ".pseolint\n", "utf8");
    const result = await ensurePseolintGitignored(tmp);
    expect(result.modified).toBe(false);
    expect(result.reason).toBe("already-ignored");
  });

  it("walks up to find repo root from a nested directory", async () => {
    await initRepo(tmp);
    const gi = join(tmp, ".gitignore");
    await writeFile(gi, "node_modules/\n", "utf8");
    const nested = join(tmp, "apps", "web", "src");
    await mkdir(nested, { recursive: true });
    const result = await ensurePseolintGitignored(nested);
    expect(result.modified).toBe(true);
    expect(result.gitignorePath).toBe(gi);
  });

  it("ignores commented-out .pseolint lines", async () => {
    await initRepo(tmp);
    const gi = join(tmp, ".gitignore");
    await writeFile(gi, "# .pseolint/\nnode_modules/\n", "utf8");
    const result = await ensurePseolintGitignored(tmp);
    expect(result.modified).toBe(true);
    const after = await readFile(gi, "utf8");
    // Commented line stays; a real ignore pattern is added.
    expect(after).toContain("# .pseolint/");
    expect(after.match(/^\.pseolint\/$/m)).not.toBeNull();
  });
});
