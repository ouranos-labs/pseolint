import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted so the mock factory's refs exist before the (hoisted) imports run.
const { fetchJson, uploadJson } = vi.hoisted(() => ({ fetchJson: vi.fn(), uploadJson: vi.fn() }));
vi.mock("@/lib/r2", () => ({ fetchJson, uploadJson }));

import { R2CacheBackend } from "./r2-cache-backend";
import { CACHE_ENTRY_SCHEMA_VERSION } from "@pseolint/core";

const KEY_RE = /^audit-cache\/example\.com\/[0-9a-f]{64}$/;
const entry = {
  schemaVersion: CACHE_ENTRY_SCHEMA_VERSION,
  url: "https://example.com/a",
  fetchedAt: "2026-06-21T00:00:00.000Z",
  status: 200,
  headers: { etag: '"v1"' },
  body: "<h1>hi</h1>",
};

describe("R2CacheBackend", () => {
  beforeEach(() => { fetchJson.mockReset(); uploadJson.mockReset(); });

  it("get returns the parsed entry on a hit, keyed by host + sha256(url)", async () => {
    fetchJson.mockResolvedValue(JSON.stringify(entry));
    const got = await new R2CacheBackend("example.com").get("https://example.com/a");
    expect(got).toEqual(entry);
    expect(fetchJson).toHaveBeenCalledWith(expect.stringMatching(KEY_RE));
  });

  it("get returns null on a miss", async () => {
    fetchJson.mockResolvedValue(null);
    expect(await new R2CacheBackend("example.com").get("https://example.com/a")).toBeNull();
  });

  it("get returns null on malformed JSON (no throw)", async () => {
    fetchJson.mockResolvedValue("{not json");
    expect(await new R2CacheBackend("example.com").get("https://example.com/a")).toBeNull();
  });

  it("get returns null on an R2 error (no throw)", async () => {
    fetchJson.mockRejectedValue(new Error("R2 down"));
    expect(await new R2CacheBackend("example.com").get("https://example.com/a")).toBeNull();
  });

  it("set round-trips the entry JSON to the per-host key", async () => {
    uploadJson.mockResolvedValue(undefined);
    await new R2CacheBackend("example.com").set("https://example.com/a", entry);
    expect(uploadJson).toHaveBeenCalledWith(expect.stringMatching(KEY_RE), JSON.stringify(entry));
  });

  it("set swallows R2 errors (never throws)", async () => {
    uploadJson.mockRejectedValue(new Error("R2 down"));
    await expect(new R2CacheBackend("example.com").set("https://example.com/a", entry)).resolves.toBeUndefined();
  });
});
