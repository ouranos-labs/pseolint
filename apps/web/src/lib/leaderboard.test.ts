import { describe, it, expect } from "vitest";
import {
  LEADERBOARD_RISK_MAX,
  LEADERBOARD_MIN_PAGES,
  PERMANENT_EXPIRES_AT,
  isLeaderboardEligible,
  reportRobots,
} from "./leaderboard";

const base = {
  isPublic: true,
  status: "completed" as const,
  host: "example.com" as string | null,
  pageCount: 10 as number | null,
  risk: 20 as number | null,
};

describe("isLeaderboardEligible", () => {
  it("accepts a clean, public, completed audit over the page floor", () => {
    expect(isLeaderboardEligible(base)).toBe(true);
  });
  it("rejects risk at or above the max (boundary: 40 is out)", () => {
    expect(isLeaderboardEligible({ ...base, risk: LEADERBOARD_RISK_MAX })).toBe(false);
    expect(isLeaderboardEligible({ ...base, risk: LEADERBOARD_RISK_MAX - 1 })).toBe(true);
  });
  it("rejects null risk", () => {
    expect(isLeaderboardEligible({ ...base, risk: null })).toBe(false);
  });
  it("rejects private audits", () => {
    expect(isLeaderboardEligible({ ...base, isPublic: false })).toBe(false);
  });
  it("rejects non-completed audits", () => {
    expect(isLeaderboardEligible({ ...base, status: "running" })).toBe(false);
  });
  it("rejects missing host", () => {
    expect(isLeaderboardEligible({ ...base, host: null })).toBe(false);
  });
  it("enforces the page floor (boundary: 5 in, 4 out)", () => {
    expect(isLeaderboardEligible({ ...base, pageCount: LEADERBOARD_MIN_PAGES })).toBe(true);
    expect(isLeaderboardEligible({ ...base, pageCount: LEADERBOARD_MIN_PAGES - 1 })).toBe(false);
    expect(isLeaderboardEligible({ ...base, pageCount: null })).toBe(false);
  });
});

describe("reportRobots", () => {
  it("indexes + follows eligible reports", () => {
    expect(reportRobots(base)).toEqual({ index: true, follow: true });
  });
  it("noindexes everything else", () => {
    expect(reportRobots({ ...base, isPublic: false })).toEqual({ index: false, follow: false });
    expect(reportRobots({ ...base, risk: 90 })).toEqual({ index: false, follow: false });
  });
});

describe("PERMANENT_EXPIRES_AT", () => {
  it("is the far-future sentinel Postgres can serialize", () => {
    expect(PERMANENT_EXPIRES_AT).toBe("9999-12-31T23:59:59.999Z");
    expect(Number.isNaN(new Date(PERMANENT_EXPIRES_AT).getTime())).toBe(false);
  });
});
