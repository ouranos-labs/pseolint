import { describe, expect, it } from "vitest";
import { checkOriginHealth, type OriginPreflightOptions } from "../src/origin-preflight.js";
import type { Fetcher } from "../src/cache.js";

// Tests run offline: skip the DNS-backed SSRF validator (covered separately in
// ssrf-guard.test.ts) so the scripted fetcher is what drives every probe.
const noopValidateHop: OriginPreflightOptions["validateHop"] = async () => {};

function probe(url: string, options: OriginPreflightOptions) {
  return checkOriginHealth(url, { validateHop: noopValidateHop, ...options });
}

/**
 * Build a deterministic fetcher that walks a scripted list of responses,
 * one per probe. A `status` is returned after optional `delayMs`; `throws`
 * simulates a timeout / connection failure.
 */
function scriptedFetcher(
  script: Array<{ status?: number; delayMs?: number; throws?: boolean }>,
): Fetcher {
  let i = 0;
  return async (): Promise<Response> => {
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    if (step.delayMs) await new Promise((r) => setTimeout(r, step.delayMs));
    if (step.throws) throw new Error("simulated network failure");
    return new Response("<html><body>ok</body></html>", {
      status: step.status ?? 200,
      headers: { "content-type": "text/html" },
    });
  };
}

describe("checkOriginHealth", () => {
  it("returns ok for a fast, healthy origin", async () => {
    const report = await probe("https://example.com/", {
      probes: 3,
      fetcher: scriptedFetcher([{ status: 200 }, { status: 200 }, { status: 200 }]),
    });
    expect(report.verdict).toBe("ok");
    expect(report.responded).toBe(3);
    expect(report.errorRatio).toBe(0);
  });

  it("reports unreachable only when every probe fails", async () => {
    const report = await probe("https://down.example/", {
      probes: 3,
      fetcher: scriptedFetcher([{ throws: true }, { throws: true }, { throws: true }]),
    });
    expect(report.verdict).toBe("unreachable");
    expect(report.responded).toBe(0);
    expect(report.reason).toContain("no response");
  });

  it("does not trip on a single transient failure", async () => {
    const report = await probe("https://flaky.example/", {
      probes: 3,
      // One failure, two clean responses — a blip, not degradation.
      fetcher: scriptedFetcher([{ throws: true }, { status: 200 }, { status: 200 }]),
    });
    expect(report.verdict).toBe("ok");
    expect(report.responded).toBe(2);
    expect(report.errorRatio).toBe(0);
  });

  it("reports degraded when a majority of probes return 5xx", async () => {
    const report = await probe("https://overloaded.example/", {
      probes: 3,
      fetcher: scriptedFetcher([{ status: 503 }, { status: 503 }, { status: 200 }]),
    });
    expect(report.verdict).toBe("degraded");
    expect(report.errorRatio).toBeCloseTo(2 / 3);
    expect(report.reason).toContain("5xx");
  });

  it("does not trip when 5xx ratio only equals the threshold", async () => {
    // 1 of 2 responding = 0.5, which is not > 0.5 (strict comparison).
    const report = await probe("https://edge.example/", {
      probes: 2,
      fetcher: scriptedFetcher([{ status: 500 }, { status: 200 }]),
    });
    expect(report.errorRatio).toBe(0.5);
    expect(report.verdict).toBe("ok");
  });

  it("does not treat 4xx as origin degradation", async () => {
    // A 403/404 on the entry URL is a content issue, not a health problem.
    const report = await probe("https://gated.example/", {
      probes: 3,
      fetcher: scriptedFetcher([{ status: 403 }, { status: 404 }, { status: 401 }]),
    });
    expect(report.verdict).toBe("ok");
    expect(report.errorRatio).toBe(0);
  });

  it("reports degraded when the origin is sustainedly slow", async () => {
    const report = await probe("https://slow.example/", {
      probes: 2,
      slowMedianMs: 50,
      fetcher: scriptedFetcher([{ status: 200, delayMs: 120 }, { status: 200, delayMs: 120 }]),
    });
    expect(report.verdict).toBe("degraded");
    expect(report.reason).toContain("exceeds");
    expect(report.medianMs).toBeGreaterThan(50);
  });

  it("fires probes concurrently — wall-clock is ~one probe, not N", async () => {
    // Three 100ms probes run in parallel finish in well under the 300ms a
    // sequential loop would take. This is what lets the check observe the
    // origin under parallel load without taxing the request that triggered it.
    const start = Date.now();
    const report = await probe("https://example.com/", {
      probes: 3,
      fetcher: scriptedFetcher([
        { status: 200, delayMs: 100 },
        { status: 200, delayMs: 100 },
        { status: 200, delayMs: 100 },
      ]),
    });
    const elapsed = Date.now() - start;
    expect(report.verdict).toBe("ok");
    expect(report.responded).toBe(3);
    expect(elapsed).toBeLessThan(250);
  });

  it("stops probing once the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const report = await probe("https://example.com/", {
      probes: 3,
      signal: controller.signal,
      fetcher: scriptedFetcher([{ status: 200 }]),
    });
    expect(report.attempted).toBe(0);
    // No probes attempted → fail-open to ok rather than a false "unreachable".
    expect(report.verdict).toBe("ok");
  });
});
