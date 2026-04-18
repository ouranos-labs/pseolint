import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditSource } from "../../src/auditor.js";
import { createStubAdapter } from "../helpers/stub-adapter.js";

describe("auditSource + AI triage (integration)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-ai-int-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function setupSite(): Promise<string> {
    const siteDir = join(dir, "site");
    await mkdir(siteDir, { recursive: true });
    await writeFile(
      join(siteDir, "index.html"),
      "<!doctype html><html><head><title>Home</title><meta name=\"description\" content=\"A short page that may trigger thin-content.\"></head><body><h1>Home</h1><p>x</p></body></html>",
      "utf8",
    );
    return siteDir;
  }

  it("attaches summary.triage when ai.enabled with stub adapter", async () => {
    const siteDir = await setupSite();
    const stub = createStubAdapter({
      text: JSON.stringify({
        rootCauses: [],
        narrative: "Nothing critical to fix.",
      }),
    });
    const adaptersModule = await import("../../src/ai/adapters/index.js");
    vi.spyOn(adaptersModule, "createAdapter").mockResolvedValue(stub);

    const result = await auditSource(siteDir, {
      ai: { enabled: true, provider: "anthropic", model: "claude-sonnet-4-6", cache: false },
    });

    expect(result.triage).toBeDefined();
    expect(result.triage!.narrative).toBe("Nothing critical to fix.");
    expect(stub.calls).toHaveLength(1);

    vi.restoreAllMocks();
  });

  it("audit completes without triage when adapter throws", async () => {
    const siteDir = await setupSite();
    const stub = createStubAdapter({ throwKind: "auth" });
    const adaptersModule = await import("../../src/ai/adapters/index.js");
    vi.spyOn(adaptersModule, "createAdapter").mockResolvedValue(stub);

    const result = await auditSource(siteDir, {
      ai: { enabled: true, provider: "anthropic", model: "m", cache: false },
    });

    expect(result.triage).toBeUndefined();
    expect(result.findings).toBeDefined();

    vi.restoreAllMocks();
  });

  it("ai disabled => no triage field, no adapter call", async () => {
    const siteDir = await setupSite();
    const adaptersModule = await import("../../src/ai/adapters/index.js");
    const spy = vi.spyOn(adaptersModule, "createAdapter");

    const result = await auditSource(siteDir);
    expect(result.triage).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
