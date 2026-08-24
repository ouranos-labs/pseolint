/**
 * Report privacy and indexability.
 *
 * `robots.txt` used to carry `Disallow: /r/`, which added nothing to privacy and
 * broke the public tier. Privacy has always come from the page: a private report
 * 404s for anyone who is not the owner, and `reportRobots()` emits noindex for
 * any public-but-ineligible one. robots.txt only prevents *crawling*, so a
 * blocked report could still be indexed URL-only from an external link, while
 * Google could never fetch the eligible reports that declare themselves
 * indexable.
 *
 * These two invariants are what make dropping the disallow safe, so they are
 * asserted rather than assumed: only eligible reports may say `index`, and the
 * genuinely private areas stay blocked.
 */
import { describe, it, expect } from "vitest";
import robots from "@/app/robots";
import {
  reportRobots,
  LEADERBOARD_RISK_MAX,
  LEADERBOARD_MIN_PAGES,
} from "@/lib/leaderboard";

const eligible = {
  isPublic: true,
  status: "completed" as const,
  host: "example.com",
  pageCount: LEADERBOARD_MIN_PAGES,
  risk: LEADERBOARD_RISK_MAX - 1,
};

const disallow = (): string[] => {
  const rules = robots().rules;
  const first = Array.isArray(rules) ? rules[0] : rules;
  const d = first?.disallow ?? [];
  return Array.isArray(d) ? d : [d];
};

describe("robots.txt", () => {
  it("does not block /r/, so eligible reports can be crawled", () => {
    expect(disallow()).not.toContain("/r/");
  });

  it("still blocks the account and machinery paths", () => {
    for (const path of ["/a/", "/api/", "/dashboard/", "/signin"]) {
      expect(disallow(), path).toContain(path);
    }
  });
});

describe("reportRobots", () => {
  it("indexes an eligible report", () => {
    expect(reportRobots(eligible)).toEqual({ index: true, follow: true });
  });

  // Each case below is a report Google must not index. With /r/ crawlable,
  // this meta directive is the only thing standing between them and the index.
  it.each([
    ["private", { isPublic: false }],
    ["not completed", { status: "running" }],
    ["over the risk ceiling", { risk: LEADERBOARD_RISK_MAX }],
    ["under the page floor", { pageCount: LEADERBOARD_MIN_PAGES - 1 }],
    ["missing a host", { host: null }],
    ["risk unknown", { risk: null }],
  ])("noindexes a report that is %s", (_label, override) => {
    expect(reportRobots({ ...eligible, ...override })).toEqual({
      index: false,
      follow: false,
    });
  });
});
