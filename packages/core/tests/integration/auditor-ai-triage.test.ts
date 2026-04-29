import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditSource } from "../../src/auditor.js";
import { MockModel, okResponse } from "../helpers/mock-model.js";

describe("auditSource + AI triage (integration)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-ai-int-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
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

  it("attaches summary.triage when ai.enabled with mock model", async () => {
    const siteDir = await setupSite();
    let calls = 0;
    const mockModel = new MockModel({
      doGenerate: async () => {
        calls += 1;
        return okResponse({
          rootCauses: [
            {
              label: "Example root cause",
              findingsCount: 0,
              affectedRuleIds: [],
              severity: "info",
              fixOrder: 1,
              rationale: "Stub rationale for tests.",
              relatedFindingIds: [],
            },
          ],
          narrative: "Nothing critical to fix.",
        });
      },
    });
    const adaptersModule = await import("../../src/ai/adapters/index.js");
    vi.spyOn(adaptersModule, "createLanguageModel").mockResolvedValue({
      model: mockModel,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
    });

    const result = await auditSource(siteDir, {
      ai: { enabled: true, provider: "anthropic", model: "claude-sonnet-4-6", cache: false },
    });

    expect(result.triage).toBeDefined();
    expect(result.triage!.narrative).toBe("Nothing critical to fix.");
    expect(calls).toBe(1);
  });

  it("audit completes without triage when model throws", async () => {
    const siteDir = await setupSite();
    const mockModel = new MockModel({
      doGenerate: async () => { throw new Error("auth failed"); },
    });
    const adaptersModule = await import("../../src/ai/adapters/index.js");
    vi.spyOn(adaptersModule, "createLanguageModel").mockResolvedValue({
      model: mockModel,
      providerId: "anthropic",
      modelId: "m",
    });

    const result = await auditSource(siteDir, {
      ai: { enabled: true, provider: "anthropic", model: "m", cache: false },
    });

    expect(result.triage).toBeUndefined();
    expect(result.issues).toBeDefined();
  });

  it("ai disabled => no triage field, no model call", async () => {
    const siteDir = await setupSite();
    const adaptersModule = await import("../../src/ai/adapters/index.js");
    const spy = vi.spyOn(adaptersModule, "createLanguageModel");

    const result = await auditSource(siteDir);
    expect(result.triage).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });
});
