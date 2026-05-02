import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionLog } from "../../../src/ai/orchestrator/log.js";

describe("SessionLog", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-orch-log-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("buffers events for replay", async () => {
    const log = new SessionLog();
    await log.emit({ kind: "thought", text: "hello" });
    await log.emit({ kind: "thought", text: "world" });
    expect(log.events()).toHaveLength(2);
    expect(log.events()[0]).toEqual({ kind: "thought", text: "hello" });
  });

  it("fans out to onEvent callback", async () => {
    const seen: string[] = [];
    const log = new SessionLog({
      onEvent: (e) => {
        if (e.kind === "thought") seen.push(e.text);
      },
    });
    await log.emit({ kind: "thought", text: "a" });
    await log.emit({ kind: "thought", text: "b" });
    expect(seen).toEqual(["a", "b"]);
  });

  it("writes NDJSON file when ndjsonPath is provided", async () => {
    const path = join(dir, "session.ndjson");
    const log = new SessionLog({ ndjsonPath: path });
    await log.emit({ kind: "thought", text: "first" });
    await log.emit({ kind: "thought", text: "second" });
    const contents = await readFile(path, "utf8");
    const lines = contents.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ kind: "thought", text: "first" });
  });

  it("buffer + file + callback all populate when all three are set", async () => {
    const path = join(dir, "session.ndjson");
    const seen: number[] = [];
    const log = new SessionLog({
      ndjsonPath: path,
      onEvent: (e) => {
        if (e.kind === "step_usage") seen.push(e.inputTokens);
      },
    });
    await log.emit({ kind: "step_usage", inputTokens: 100, outputTokens: 50, estimatedUsd: 0.001 });
    expect(log.events()).toHaveLength(1);
    expect(seen).toEqual([100]);
    const fileContent = await readFile(path, "utf8");
    expect(fileContent).toContain('"inputTokens":100');
  });

  it("survives a throwing onEvent callback (does not propagate)", async () => {
    const log = new SessionLog({
      onEvent: () => {
        throw new Error("sink down");
      },
    });
    // Should not throw. Buffer should still hold the event.
    await log.emit({ kind: "thought", text: "still here" });
    expect(log.events()).toHaveLength(1);
  });
});
