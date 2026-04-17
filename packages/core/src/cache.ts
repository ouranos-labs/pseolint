import { createHash } from "node:crypto";

export const CACHE_ENTRY_SCHEMA_VERSION = 1;

export interface CacheEntry {
  schemaVersion: number;
  url: string;
  fetchedAt: string; // ISO 8601
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface RedirectPointerEntry {
  schemaVersion: number;
  redirectsTo: string;
  fetchedAt: string;
  status: number;
}

export type AnyCacheEntry = CacheEntry | RedirectPointerEntry;

export function isRedirectPointer(entry: AnyCacheEntry): entry is RedirectPointerEntry {
  return "redirectsTo" in entry;
}

export function cacheKeyFor(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}
