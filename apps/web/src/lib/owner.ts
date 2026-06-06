import "server-only";
import { env } from "@/lib/env";

/**
 * Pure allowlist check: is `email` in the comma-separated `allowlistRaw`?
 * Case-insensitive, whitespace-tolerant. Empty/undefined inputs → false.
 */
export function emailInAllowlist(
  email: string | null | undefined,
  allowlistRaw: string | undefined,
): boolean {
  if (!email || !allowlistRaw) return false;
  const allow = allowlistRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

/** Env-backed wrapper: is this email an owner per OWNER_EMAILS? */
export function isOwnerEmail(email: string | null | undefined): boolean {
  return emailInAllowlist(email, env().OWNER_EMAILS);
}
