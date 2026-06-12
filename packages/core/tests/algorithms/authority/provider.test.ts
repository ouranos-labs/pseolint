import { describe, test, expect } from "vitest";
import { CompositeAuthorityProvider, type AuthorityProvider } from "../../../src/algorithms/authority/provider.js";

function stub(map: Record<string, number | null>): AuthorityProvider {
  return { authorityFor: async (d) => (d in map ? map[d] : null) };
}

describe("CompositeAuthorityProvider", () => {
  test("returns the max non-null score across sources", async () => {
    const p = new CompositeAuthorityProvider([stub({ "x.com": 40 }), stub({ "x.com": 83 })]);
    expect(await p.authorityFor("x.com")).toBe(83);
  });
  test("uses the one source that has a value", async () => {
    const p = new CompositeAuthorityProvider([stub({}), stub({ "x.com": 53 })]);
    expect(await p.authorityFor("x.com")).toBe(53);
  });
  test("returns null when all sources are null (fail-safe)", async () => {
    const p = new CompositeAuthorityProvider([stub({}), stub({})]);
    expect(await p.authorityFor("x.com")).toBeNull();
  });
  test("a throwing source is treated as null, not fatal", async () => {
    const boom: AuthorityProvider = { authorityFor: async () => { throw new Error("network"); } };
    const p = new CompositeAuthorityProvider([boom, stub({ "x.com": 70 })]);
    expect(await p.authorityFor("x.com")).toBe(70);
  });
});
