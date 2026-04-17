import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
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
      source: "https://example.com",
      renderMode: "static",
      urls: {
        "https://example.com/a": {
          contentHash: "sha256:abc",
          fetchedAt: "2026-04-17T12:00:00Z",
          status: 200,
          findingIds: ["content/thin-content"],
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
});
