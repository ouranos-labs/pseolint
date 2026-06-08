import { describe, it, expect, vi } from "vitest";
import { withDbRetry } from "./db-retry";

/** Mimics a postgres.js connection error (code on the error itself). */
function pgError(code: string): Error & { code: string } {
  return Object.assign(new Error(`${code}: connection failed`), { code });
}

/** Mimics Drizzle's wrapper: `Failed query` with the driver error on `.cause`. */
function drizzleWrapped(cause: Error): Error {
  return Object.assign(new Error("Failed query: select ..."), { cause });
}

describe("withDbRetry", () => {
  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn(async () => "ok");
    expect(await withDbRetry(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient CONNECT_TIMEOUT and then succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw pgError("CONNECT_TIMEOUT");
      return "recovered";
    });
    expect(await withDbRetry(fn)).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("detects a transient error wrapped by Drizzle (.cause)", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw drizzleWrapped(pgError("CONNECTION_CLOSED"));
      return "recovered";
    });
    expect(await withDbRetry(fn)).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a non-transient error (e.g. a real SQL error)", async () => {
    const fn = vi.fn(async () => {
      throw pgError("23505"); // unique_violation — a genuine query failure
    });
    await expect(withDbRetry(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the configured number of attempts and rethrows", async () => {
    const fn = vi.fn(async () => {
      throw pgError("CONNECT_TIMEOUT");
    });
    await expect(withDbRetry(fn, 3)).rejects.toMatchObject({ code: "CONNECT_TIMEOUT" });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("matches transient errors by message when no code is present", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new Error("write CONNECT_TIMEOUT to upstream");
      return "recovered";
    });
    expect(await withDbRetry(fn)).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
