import { describe, test, expect } from "vitest";
import { OpenPageRankProvider } from "../../../src/algorithms/authority/openpagerank.js";

function mockFetch(body: unknown, status = 200) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
}

describe("OpenPageRankProvider", () => {
  test("maps page_rank_decimal (0–10) to a 0–100 score", async () => {
    const p = new OpenPageRankProvider("KEY", mockFetch({
      status_code: 200,
      response: [{ status_code: 200, error: "", page_rank_decimal: 8.3, domain: "x.com" }],
    }));
    expect(await p.authorityFor("x.com")).toBe(83);
  });
  test("returns null on a per-domain error entry", async () => {
    const p = new OpenPageRankProvider("KEY", mockFetch({
      status_code: 200,
      response: [{ status_code: 404, error: "Domain not found", domain: "x.com" }],
    }));
    expect(await p.authorityFor("x.com")).toBeNull();
  });
  test("returns null when no API key is configured (does not call fetch)", async () => {
    let called = false;
    const p = new OpenPageRankProvider("", (async () => { called = true; return {} as Response; }));
    expect(await p.authorityFor("x.com")).toBeNull();
    expect(called).toBe(false);
  });
  test("returns null on HTTP failure", async () => {
    const p = new OpenPageRankProvider("KEY", mockFetch({}, 500));
    expect(await p.authorityFor("x.com")).toBeNull();
  });
});
