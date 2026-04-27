import { describe, expect, it } from "vitest";
import { SAFE_MODE_PRESETS, resolveSafeModeKey } from "../src/safe-mode-preset.js";

describe("SAFE_MODE_PRESETS", () => {
  it("exposes a 'dev' preset with a tiny crawl budget", () => {
    const dev = SAFE_MODE_PRESETS.dev;
    expect(dev.concurrency).toBe(1);
    expect(dev.sampleSize).toBe(25);
    expect(dev.maxCrawlDiscovered).toBe(50);
    expect(dev.guardSsrf).toBe(false);
    expect(dev.respectRobotsTxt).toBe(true);
    expect(dev.followRedirects).toBe(true);
  });

  it("keeps existing saas and cli presets intact", () => {
    expect(SAFE_MODE_PRESETS.saas.guardSsrf).toBe(true);
    expect(SAFE_MODE_PRESETS.saas.maxCrawlDiscovered).toBe(2000);
    expect(SAFE_MODE_PRESETS.cli.guardSsrf).toBe(false);
    expect(SAFE_MODE_PRESETS.cli.maxCrawlDiscovered).toBe(5000);
  });
});

describe("resolveSafeModeKey", () => {
  it("returns the explicit safeMode when set", () => {
    expect(resolveSafeModeKey("http://localhost:3000", { safeMode: "saas" })).toBe("saas");
    expect(resolveSafeModeKey("https://example.com", { safeMode: "cli" })).toBe("cli");
  });

  it("auto-selects 'dev' for localhost when no safeMode set and autoDevPreset is not disabled", () => {
    expect(resolveSafeModeKey("http://localhost:3000")).toBe("dev");
    expect(resolveSafeModeKey("http://127.0.0.1:8080/foo")).toBe("dev");
    expect(resolveSafeModeKey("http://10.0.0.5")).toBe("dev");
    expect(resolveSafeModeKey("http://[::1]:3000", {})).toBe("dev");
    expect(resolveSafeModeKey("http://foo.local", { autoDevPreset: true })).toBe("dev");
  });

  it("does NOT auto-select 'dev' for public URLs", () => {
    expect(resolveSafeModeKey("https://example.com")).toBe("__none");
    expect(resolveSafeModeKey("https://paperforge.dev/r/foo")).toBe("__none");
  });

  it("respects autoDevPreset: false — does not promote localhost", () => {
    expect(resolveSafeModeKey("http://localhost:3000", { autoDevPreset: false })).toBe("__none");
  });

  it("explicit safeMode wins over auto-detection on localhost", () => {
    // User ran `pseolint http://localhost --safe-mode cli` — respect that.
    expect(resolveSafeModeKey("http://localhost", { safeMode: "cli" })).toBe("cli");
    expect(resolveSafeModeKey("http://localhost", { safeMode: "saas" })).toBe("saas");
  });

  it("returns '__none' for non-URL sources (file paths, sitemaps on disk)", () => {
    expect(resolveSafeModeKey("./some/local/dir")).toBe("__none");
    expect(resolveSafeModeKey("D:/path/to/sitemap.xml")).toBe("__none");
  });
});
