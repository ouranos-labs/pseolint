import { describe, it, expect } from "vitest";
import { fetchPageTool } from "../../../src/ai/tools/fetch-page.js";

describe("fetch_page tool", () => {
  it("rejects non-URL input via Zod", async () => {
    const r = await fetchPageTool.run({ url: "not a url" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });

  it("rejects private IP targets via SSRF guard", async () => {
    // `validateTargetHost` resolves DNS for non-IP hostnames, so a literal
    // 127.0.0.1 is the cheap deterministic check — no DNS, no flake.
    const r = await fetchPageTool.run({ url: "http://127.0.0.1:1234/" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("EXECUTE_ERROR");
  });

  it("rejects out-of-range timeout", async () => {
    const r = await fetchPageTool.run({
      url: "https://example.com/",
      timeoutMs: 60_000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });

  it("threads abort signal through to the underlying fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const r = await fetchPageTool.run(
      { url: "https://example.com/" },
      { signal: controller.signal },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Either explicit "aborted" or a generic AbortError surfaced as
      // EXECUTE_ERROR — both prove the signal made it to the fetch layer.
      expect(r.errorCode).toBe("EXECUTE_ERROR");
      expect(r.error.toLowerCase()).toMatch(/abort|signal|cancel/);
    }
  });
});
