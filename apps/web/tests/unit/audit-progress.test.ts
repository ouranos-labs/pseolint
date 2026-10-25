import { describe, it, expect } from "vitest";
import {
  classifyPollStatus,
  elapsedSince,
  formatElapsed,
  MAX_BACKOFF_MS,
  nextPollDelay,
  POLL_INTERVAL_MS,
  progressPhase,
} from "@/lib/audit-progress";

describe("audit progress rules", () => {
  it("404/403 mean gone; 5xx and other errors are transient, never 'failed'", () => {
    expect(classifyPollStatus(200)).toBe("ok");
    expect(classifyPollStatus(404)).toBe("gone");
    expect(classifyPollStatus(403)).toBe("gone");
    expect(classifyPollStatus(500)).toBe("transient");
    expect(classifyPollStatus(502)).toBe("transient");
    expect(classifyPollStatus(429)).toBe("transient");
  });

  it("backs off exponentially and caps", () => {
    expect(nextPollDelay(0)).toBe(POLL_INTERVAL_MS);
    expect(nextPollDelay(1)).toBe(4000);
    expect(nextPollDelay(2)).toBe(8000);
    expect(nextPollDelay(10)).toBe(MAX_BACKOFF_MS);
  });

  it("phases at 120s and 10 min", () => {
    expect(progressPhase(30)).toBe("normal");
    expect(progressPhase(119)).toBe("normal");
    expect(progressPhase(120)).toBe("slow");
    expect(progressPhase(599)).toBe("slow");
    expect(progressPhase(600)).toBe("stuck");
  });

  it("elapsed is measured from the audit's createdAt, not page mount", () => {
    const created = "2026-10-25T20:00:00.000Z";
    expect(elapsedSince(created, Date.parse("2026-10-25T20:03:05.400Z"))).toBe(185);
    expect(elapsedSince(created, Date.parse("2026-10-25T19:59:00.000Z"))).toBe(0);
    expect(elapsedSince(undefined)).toBeNull();
    expect(elapsedSince("garbage")).toBeNull();
  });

  it("formats elapsed", () => {
    expect(formatElapsed(45)).toBe("45s");
    expect(formatElapsed(185)).toBe("3m 05s");
  });
});
