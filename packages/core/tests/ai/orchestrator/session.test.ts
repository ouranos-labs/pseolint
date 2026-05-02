import { describe, it, expect } from "vitest";
import { SessionState } from "../../../src/ai/orchestrator/session.js";

describe("SessionState", () => {
  const baseOpts = {
    domain: "example.com",
    userId: "user-1",
    providerId: "anthropic",
    modelId: "claude-sonnet-4-6",
  };

  it("assigns a unique session id and exposes start/finish lifecycle", async () => {
    const s = new SessionState(baseOpts);
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.isFinished()).toBe(false);
    await s.start();
    const events = s.events();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("session_started");
  });

  it("captures the manifest passed to markFinished", () => {
    const s = new SessionState(baseOpts);
    expect(s.getManifest()).toBeNull();
    s.markFinished({ verdict: "ready" });
    expect(s.isFinished()).toBe(true);
    expect(s.getManifest()).toEqual({ verdict: "ready" });
  });

  it("threads onEvent callback through to the log", async () => {
    const seen: string[] = [];
    const s = new SessionState({
      ...baseOpts,
      onEvent: (e) => {
        seen.push(e.kind);
      },
    });
    await s.start();
    await s.emit({ kind: "thought", text: "hi" });
    expect(seen).toEqual(["session_started", "thought"]);
  });

  it("uses default budget caps when no override is provided", () => {
    const s = new SessionState(baseOpts);
    expect(s.caps.maxToolCalls).toBe(100);
    expect(s.caps.maxSessionUsd).toBe(5);
    expect(s.caps.watchdogIntervalCalls).toBe(20);
  });

  it("merges partial budget overrides with defaults", () => {
    const s = new SessionState({ ...baseOpts, budget: { maxToolCalls: 10 } });
    expect(s.caps.maxToolCalls).toBe(10);
    // Other caps fall through to defaults
    expect(s.caps.maxSessionUsd).toBe(5);
    expect(s.caps.maxWallSeconds).toBe(300);
  });
});
