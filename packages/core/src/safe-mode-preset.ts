import type { SafeMode, AuditOptions } from "./types.js";
import { isLocalhostUrl } from "./ssrf-guard.js";

export type SafeModePreset = {
  concurrency?: number;
  sampleSize?: number;
  guardSsrf?: boolean;
  respectRobotsTxt?: boolean;
  followRedirects?: boolean;
  maxCrawlDiscovered?: number;
  maxFetchBytes?: number;
};

export type SafeModeKey = SafeMode | "__none";

/**
 * Presets that flip several safety defaults at once. Individual options on
 * AuditOptions override the preset when explicitly set. `__none` is the
 * sentinel key used when no preset is selected — all fields undefined so the
 * `??` chain falls through to hard-coded defaults.
 */
export const SAFE_MODE_PRESETS: Record<SafeModeKey, SafeModePreset> = {
  saas: {
    // Hosted-service defaults. Assume user-submitted URLs are hostile.
    guardSsrf: true,
    respectRobotsTxt: true,
    followRedirects: true,
    maxCrawlDiscovered: 2000,
    maxFetchBytes: 10_000_000,
  },
  cli: {
    // Local / dev defaults. User auditing their own or local site.
    guardSsrf: false,
    respectRobotsTxt: true,
    followRedirects: true,
    maxCrawlDiscovered: 5000,
    maxFetchBytes: 52_428_800,
  },
  dev: {
    // Localhost probe. A cache-cold dev server can amplify every crawled URL
    // into a chain of DB queries — keep the first pass tiny and reversible.
    concurrency: 1,
    sampleSize: 25,
    guardSsrf: false,
    respectRobotsTxt: true,
    followRedirects: true,
    maxCrawlDiscovered: 50,
    maxFetchBytes: 52_428_800,
  },
  __none: {},
};

/**
 * Pick the preset key for a given source + options combination.
 *
 *   explicit `safeMode`  → that preset
 *   autoDevPreset !== false && localhost URL → "dev"
 *   otherwise            → "__none"
 */
export function resolveSafeModeKey(
  source: string,
  options?: Pick<AuditOptions, "safeMode" | "autoDevPreset">,
): SafeModeKey {
  if (options?.safeMode) return options.safeMode;
  if (options?.autoDevPreset === false) return "__none";
  if (isLocalhostUrl(source)) return "dev";
  return "__none";
}
