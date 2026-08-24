/**
 * Channel attribution is a trust boundary.
 *
 * The hint arrives as `?from=` on the landing page and is echoed into the POST
 * body, so it is attacker-controlled. `audits.source` exists to answer "which
 * acquisition channel is worth investing in", and a column anyone can write
 * arbitrary strings into cannot answer that: the resolver must map to a closed
 * set and fall back to "user" for everything else.
 */
import { describe, it, expect } from "vitest";
import { resolveAuditChannel } from "@/lib/audit-channel";

describe("resolveAuditChannel", () => {
  it("attributes the extension hand-off", () => {
    expect(resolveAuditChannel("extension")).toBe("extension");
  });

  it("attributes the SERP overlay to the extension that ships it", () => {
    expect(resolveAuditChannel("serp")).toBe("extension");
  });

  it("is case-insensitive", () => {
    expect(resolveAuditChannel("Extension")).toBe("extension");
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["empty", ""],
  ])("falls back to user when the hint is %s", (_label, hint) => {
    expect(resolveAuditChannel(hint)).toBe("user");
  });

  it.each([
    ["an unknown channel", "carrier-pigeon"],
    ["a value that would corrupt leaderboard logic", "seed"],
    ["an injection attempt", "'; drop table audit; --"],
    ["a near-miss", "extensions"],
  ])("refuses to write through %s", (_label, hint) => {
    expect(resolveAuditChannel(hint)).toBe("user");
  });
});
