import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mcpApiKeys } from "@/db/schema";

/** `pseo_` + base64url(32 random bytes). 256 bits of entropy. */
export const TOKEN_RE = /^pseo_[A-Za-z0-9_-]{43}$/;

export function generateMcpToken(): string {
  return "pseo_" + randomBytes(32).toString("base64url");
}

/** sha256 hex of the full token. High-entropy random ⇒ fast hash is safe (no KDF needed). */
export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** First 8 chars of the token body (after the `pseo_` prefix), for dashboard display. */
export function mcpTokenPrefix(token: string): string {
  return token.slice(5, 13);
}

export interface McpKeySummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** Create a key for `userId`. Returns the plaintext token ONCE — it is never recoverable after. */
export async function createMcpKey(userId: string, name: string): Promise<{ token: string; prefix: string }> {
  const token = generateMcpToken();
  const prefix = mcpTokenPrefix(token);
  await db.insert(mcpApiKeys).values({
    userId,
    name: name.slice(0, 100) || "MCP key",
    prefix,
    keyHash: hashMcpToken(token),
  });
  return { token, prefix };
}

/** Verify a presented token. Returns the owning userId, or null if unknown/revoked/malformed. */
export async function verifyMcpKey(token: string): Promise<{ userId: string } | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [row] = await db
    .select({ id: mcpApiKeys.id, userId: mcpApiKeys.userId })
    .from(mcpApiKeys)
    .where(and(eq(mcpApiKeys.keyHash, hashMcpToken(token)), isNull(mcpApiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  // Best-effort last-used stamp; ignore failures so verification never blocks on it.
  void db.update(mcpApiKeys).set({ lastUsedAt: new Date() }).where(eq(mcpApiKeys.id, row.id)).catch(() => {});
  return { userId: row.userId };
}

export async function listMcpKeys(userId: string): Promise<McpKeySummary[]> {
  return db
    .select({
      id: mcpApiKeys.id,
      name: mcpApiKeys.name,
      prefix: mcpApiKeys.prefix,
      createdAt: mcpApiKeys.createdAt,
      lastUsedAt: mcpApiKeys.lastUsedAt,
    })
    .from(mcpApiKeys)
    .where(and(eq(mcpApiKeys.userId, userId), isNull(mcpApiKeys.revokedAt)));
}

/** Soft-revoke a key. Scoped to the owner so users cannot revoke each other's keys. */
export async function revokeMcpKey(userId: string, id: string): Promise<void> {
  await db
    .update(mcpApiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpApiKeys.id, id), eq(mcpApiKeys.userId, userId)));
}
