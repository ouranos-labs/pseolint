import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalizeHtmlForHash,
  computeContentHash,
  readState,
  writeState,
  STATE_SCHEMA_VERSION,
  type RunState,
} from "../src/state.js";

describe("normalizeHtmlForHash", () => {
  it("collapses whitespace", () => {
    expect(normalizeHtmlForHash("<p>hi   there</p>"))
      .toBe(normalizeHtmlForHash("<p>hi there</p>"));
  });

  it("strips script contents", () => {
    const a = normalizeHtmlForHash("<html><script>var x = 1;</script><body>hi</body></html>");
    const b = normalizeHtmlForHash("<html><script>var x = 2;</script><body>hi</body></html>");
    expect(a).toBe(b);
  });

  it("detects visible-content change", () => {
    const a = normalizeHtmlForHash("<body>hi</body>");
    const b = normalizeHtmlForHash("<body>hello</body>");
    expect(a).not.toBe(b);
  });

  it("strips HTML comments (build IDs, etc)", () => {
    expect(normalizeHtmlForHash("<p>hi<!-- build a1b2 --></p>"))
      .toBe(normalizeHtmlForHash("<p>hi<!-- build x9y8 --></p>"));
  });
});

describe("computeContentHash", () => {
  it("produces sha256:<hex> format", () => {
    const h = computeContentHash("<p>x</p>");
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("is stable", () => {
    expect(computeContentHash("<p>x</p>")).toBe(computeContentHash("<p>x</p>"));
  });
});

describe("readState / writeState", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "pseolint-state-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("readState returns null when file does not exist", async () => {
    expect(await readState(join(dir, "state.json"))).toBeNull();
  });

  it("round-trip preserves data", async () => {
    const s: RunState = {
      version: STATE_SCHEMA_VERSION,
      lastRun: "2026-04-17T12:00:00Z",
      lastFullAuditAt: "2026-04-17T12:00:00Z",
      source: "https://example.com",
      renderMode: "static",
      rulesetVersion: "1",
      urls: {
        "https://example.com/a": {
          contentHash: "sha256:abc",
          fetchedAt: "2026-04-17T12:00:00Z",
          status: 200,
          findingIds: ["content/thin-content"],
          findings: [],
          rulesetVersion: "1",
        },
      },
      summary: { score: 42, totalFindings: 1, byCategory: { content: 1 } },
    };
    const path = join(dir, "state.json");
    await writeState(path, s);
    const back = await readState(path);
    expect(back).toEqual(s);
  });

  it("rejects unknown version with clear error", async () => {
    const path = join(dir, "state.json");
    await writeFile(path, JSON.stringify({ version: 999 }), "utf8");
    await expect(readState(path)).rejects.toThrow(/unsupported state version/i);
  });

  it("rejects state with malformed shape (missing required fields)", async () => {
    const path = join(dir, "state.json");
    await writeFile(path, JSON.stringify({ version: STATE_SCHEMA_VERSION }), "utf8");
    await expect(readState(path)).rejects.toThrow(/malformed shape/i);
  });

  it("throws on invalid JSON", async () => {
    const path = join(dir, "state.json");
    await writeFile(path, "not json{", "utf8");
    await expect(readState(path)).rejects.toThrow(/not valid JSON/i);
  });

  it("preserves empty findingIds on round-trip", async () => {
    const path = join(dir, "state.json");
    const s: RunState = {
      version: STATE_SCHEMA_VERSION,
      lastRun: "2026-04-17T12:00:00Z",
      lastFullAuditAt: "2026-04-17T12:00:00Z",
      source: "https://example.com",
      renderMode: "static",
      rulesetVersion: "1",
      urls: {
        "https://example.com/clean": {
          contentHash: "sha256:abc",
          fetchedAt: "2026-04-17T12:00:00Z",
          status: 200,
          findingIds: [],
          findings: [],
          rulesetVersion: "1",
        },
      },
      summary: { score: 100, totalFindings: 0, byCategory: {} },
    };
    await writeState(path, s);
    const back = await readState(path);
    expect(back?.urls["https://example.com/clean"].findingIds).toEqual([]);
  });
});

describe("state schema v2", () => {
  it("STATE_SCHEMA_VERSION is 2", () => {
    expect(STATE_SCHEMA_VERSION).toBe(2);
  });

  it("readState rejects v1 state with version mismatch error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pseolint-state-"));
    const path = join(dir, "state.json");
    writeFileSync(path, JSON.stringify({
      version: 1,
      lastRun: "2026-01-01T00:00:00Z",
      source: "https://example.com",
      renderMode: "static",
      urls: {},
      summary: { score: 0, totalFindings: 0, byCategory: {} },
    }));
    await expect(readState(path)).rejects.toThrow(/unsupported state version 1/);
  });

  it("writeState round-trips v2 fields", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pseolint-state-"));
    const path = join(dir, "state.json");
    const state: RunState = {
      version: STATE_SCHEMA_VERSION,
      lastRun: "2026-05-01T00:00:00Z",
      lastFullAuditAt: "2026-05-01T00:00:00Z",
      source: "https://example.com",
      renderMode: "static",
      rulesetVersion: "1",
      urls: {
        "https://example.com/a": {
          contentHash: "sha256:abc",
          fetchedAt: "2026-05-01T00:00:00Z",
          status: 200,
          findingIds: [],
          findings: [],
          rulesetVersion: "1",
          lastModified: "Wed, 01 May 2026 00:00:00 GMT",
          etag: "\"abc\"",
        },
      },
      summary: { score: 100, totalFindings: 0, byCategory: {} },
    };
    await writeState(path, state);
    const read = await readState(path);
    expect(read?.urls["https://example.com/a"].lastModified).toBe("Wed, 01 May 2026 00:00:00 GMT");
    expect(read?.urls["https://example.com/a"].etag).toBe("\"abc\"");
    expect(read?.urls["https://example.com/a"].rulesetVersion).toBe("1");
    expect(read?.lastFullAuditAt).toBe("2026-05-01T00:00:00Z");
    expect(read?.rulesetVersion).toBe("1");
  });
});
