import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditSource } from "../../src/auditor.js";
import { telemetryRecordSchema } from "../../src/telemetry/types.js";
import { MockModel, okResponse } from "../helpers/mock-model.js";

describe("auditSource + telemetry (integration)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-tel-int-"));
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

  it("writes a single audit record when telemetry.enabled and ai disabled", async () => {
    const siteDir = await setupSite();
    const telemetryPath = join(dir, "telemetry.jsonl");

    const result = await auditSource(siteDir, {
      telemetry: { enabled: true, path: telemetryPath, prompt: false },
    });

    const contents = await readFile(telemetryPath, "utf8");
    const lines = contents.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);

    const record = telemetryRecordSchema.parse(JSON.parse(lines[0]));
    expect(record.type).toBe("audit");
    if (record.type !== "audit") throw new Error("expected audit record");
    expect(record.schemaVersion).toBe(1);
    expect(record.runId).toMatch(/^[0-9a-f]{16}$/);
    expect(record.score).toBe(result.risk);
    expect(record.pageCount).toBe(result.pageCount);
    expect(record.findingCount).toBe(
      result.issues.blockers.length + result.issues.shouldFix.length + result.issues.informational.length,
    );
    expect(typeof record.durationMs).toBe("number");
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    // No triage sub-object when AI is disabled.
    expect(record.triage).toBeUndefined();
  });

  it("writes audit + feedback records with matching runId when AI triage runs and telemetry.feedback is provided", async () => {
    const siteDir = await setupSite();
    const telemetryPath = join(dir, "telemetry.jsonl");

    const mockModel = new MockModel({
      doGenerate: async () =>
        okResponse({
          archetype: "programmatic-blog",
          archetypeRationale: "Thin templated pages.",
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
        }),
    });
    const adaptersModule = await import("../../src/ai/adapters/index.js");
    vi.spyOn(adaptersModule, "createLanguageModel").mockResolvedValue({
      model: mockModel,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
    });

    const result = await auditSource(siteDir, {
      ai: { enabled: true, provider: "anthropic", model: "claude-sonnet-4-6", cache: false },
      telemetry: { enabled: true, path: telemetryPath, feedback: "helpful" },
    });

    expect(result.triage).toBeDefined();

    const contents = await readFile(telemetryPath, "utf8");
    const lines = contents.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(2);

    const records = lines.map((l) => telemetryRecordSchema.parse(JSON.parse(l)));
    const audit = records[0];
    const feedback = records[1];

    expect(audit.type).toBe("audit");
    expect(feedback.type).toBe("feedback");

    if (audit.type !== "audit") throw new Error("expected audit record first");
    if (feedback.type !== "feedback") throw new Error("expected feedback record second");

    // Correlation: both records share the same runId.
    expect(audit.runId).toBe(feedback.runId);
    expect(audit.runId).toMatch(/^[0-9a-f]{16}$/);

    // Audit record reflects that triage ran.
    expect(audit.triage).toBeDefined();
    expect(audit.triage?.providerId).toBe("anthropic");
    expect(audit.triage?.modelId).toBe("claude-sonnet-4-6");
    expect(audit.triage?.rootCauseCount).toBe(1);

    // Feedback record reflects the non-interactive rating we passed in.
    expect(feedback.rating).toBe("helpful");
  });

  it("does not write telemetry when telemetry.enabled is false/omitted", async () => {
    const siteDir = await setupSite();
    const telemetryPath = join(dir, "telemetry.jsonl");

    await auditSource(siteDir);

    // File should not exist — telemetry was never invoked.
    await expect(readFile(telemetryPath, "utf8")).rejects.toThrow();
  });
});
