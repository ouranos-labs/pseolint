"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { uploadTokens, userAiKeys } from "@/db/schema";
import { getRequiredSession, requireSession } from "@/lib/session";
import { createUploadToken } from "@/lib/upload-token";
import { sealSecret } from "@/lib/secret-box";
import { knownProviderIds } from "@/lib/ai-providers";
import { verifyAiKey } from "@/lib/verify-ai-key";
import { createMcpKey, listMcpKeys, revokeMcpKey, renameMcpKey } from "@/lib/mcp-keys";

/**
 * Every credential mutation for /dashboard/api-keys.
 *
 * These return a discriminated result instead of throwing. A thrown server
 * action becomes an error boundary and loses the page: for a form whose whole
 * job is "did my key work?", the failure IS the content. Callers render
 * `error` inline and toast it.
 */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_UPLOAD_TOKENS = 100;
const MAX_MCP_KEYS = 20;

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

// ── Upload tokens (pseolint CLI + GitHub Action) ────────────────────────────

export async function createUploadTokenAction(
  label: string,
): Promise<ActionResult<{ token: string }>> {
  const session = await getRequiredSession();
  const clean = label.trim();
  if (!clean) return fail("Give the token a label so you can tell them apart later.");
  if (clean.length > 100) return fail("Label is too long (100 characters max).");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(uploadTokens)
    .where(and(eq(uploadTokens.userId, session.user.id), isNull(uploadTokens.revokedAt)));

  if (count >= MAX_UPLOAD_TOKENS) {
    return fail(`You have ${MAX_UPLOAD_TOKENS} active tokens, the maximum. Revoke an unused one first.`);
  }

  const { token, hash } = await createUploadToken();
  await db.insert(uploadTokens).values({ userId: session.user.id, label: clean, tokenHash: hash });
  revalidatePath("/dashboard/api-keys");
  return { ok: true, token };
}

export async function revokeUploadTokenAction(id: string): Promise<ActionResult> {
  const session = await getRequiredSession();
  const rows = await db
    .update(uploadTokens)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(uploadTokens.id, id),
      eq(uploadTokens.userId, session.user.id),
      isNull(uploadTokens.revokedAt),
    ))
    .returning({ id: uploadTokens.id });
  // Scoped to the caller, so "no row" means it was already revoked or never
  // theirs. Same answer either way: do not leak which.
  if (rows.length === 0) return fail("That token no longer exists.");
  revalidatePath("/dashboard/api-keys");
  return { ok: true };
}

// ── MCP access keys ─────────────────────────────────────────────────────────

export async function createMcpKeyAction(
  name: string,
): Promise<ActionResult<{ token: string; prefix: string }>> {
  const session = await requireSession();
  const clean = name.trim() || "MCP key";
  if (clean.length > 100) return fail("Name is too long (100 characters max).");

  const existing = await listMcpKeys(session.user.id);
  if (existing.length >= MAX_MCP_KEYS) {
    return fail(`You have ${MAX_MCP_KEYS} active keys, the maximum. Revoke an unused one first.`);
  }

  const { token, prefix } = await createMcpKey(session.user.id, clean);
  revalidatePath("/dashboard/api-keys");
  return { ok: true, token, prefix };
}

export async function renameMcpKeyAction(id: string, name: string): Promise<ActionResult> {
  const session = await requireSession();
  const clean = name.trim();
  if (!clean) return fail("Name cannot be empty.");
  if (clean.length > 100) return fail("Name is too long (100 characters max).");
  const renamed = await renameMcpKey(session.user.id, id, clean);
  if (!renamed) return fail("That key no longer exists.");
  revalidatePath("/dashboard/api-keys");
  return { ok: true };
}

export async function revokeMcpKeyAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  await revokeMcpKey(session.user.id, id);
  revalidatePath("/dashboard/api-keys");
  return { ok: true };
}

// ── Bring-your-own AI provider key ──────────────────────────────────────────

export type SaveAiKeyInput = {
  provider: string;
  apiKey: string;
  model?: string;
  endpoint?: string;
};

/**
 * Save (or replace) the provider key, but only after proving it works.
 *
 * Verification is not optional politeness. Without it a wrong key is accepted
 * silently and the only symptom is that triage quietly produces nothing on the
 * next audit, hours later, with no error anywhere the user can see.
 */
export async function saveAiKeyAction(
  input: SaveAiKeyInput,
): Promise<ActionResult<{ modelId: string }>> {
  const session = await requireSession();
  const provider = input.provider;
  if (!knownProviderIds().has(provider)) return fail(`Unsupported provider: ${provider}`);

  const isOllama = provider === "ollama";
  const apiKey = input.apiKey.trim();
  const model = input.model?.trim() || undefined;
  const endpoint = input.endpoint?.trim() || undefined;

  if (!isOllama && apiKey.length < 8) return fail("That key looks too short. Paste the whole thing.");

  const verified = await verifyAiKey({ provider, apiKey: isOllama ? undefined : apiKey, model, endpoint });
  if (!verified.ok) return fail(verified.reason);

  // Ollama has no secret; store a placeholder so the column stays NOT NULL and
  // the sealed-value shape is uniform for every row.
  const sealed = sealSecret(isOllama ? (endpoint ?? "") : apiKey);

  await db
    .insert(userAiKeys)
    .values({ userId: session.user.id, provider, model: model ?? null, apiKey: sealed })
    .onConflictDoUpdate({
      target: userAiKeys.userId,
      set: { provider, model: model ?? null, apiKey: sealed, updatedAt: new Date() },
    });

  revalidatePath("/dashboard/api-keys");
  return { ok: true, modelId: verified.modelId };
}

/**
 * Re-check the stored key without changing it. The key may have been revoked
 * at the provider, or run out of credit, long after it was saved.
 */
export async function testAiKeyAction(): Promise<ActionResult<{ modelId: string }>> {
  const session = await requireSession();
  const [row] = await db
    .select({ provider: userAiKeys.provider, model: userAiKeys.model, apiKey: userAiKeys.apiKey })
    .from(userAiKeys)
    .where(eq(userAiKeys.userId, session.user.id))
    .limit(1);
  if (!row) return fail("No key saved.");

  const { openSecret } = await import("@/lib/secret-box");
  const secret = openSecret(row.apiKey);
  const isOllama = row.provider === "ollama";
  const res = await verifyAiKey({
    provider: row.provider,
    apiKey: isOllama ? undefined : secret,
    model: row.model ?? undefined,
    endpoint: isOllama ? secret || undefined : undefined,
  });
  return res.ok ? { ok: true, modelId: res.modelId } : fail(res.reason);
}

export async function removeAiKeyAction(): Promise<ActionResult> {
  const session = await requireSession();
  await db.delete(userAiKeys).where(eq(userAiKeys.userId, session.user.id));
  revalidatePath("/dashboard/api-keys");
  return { ok: true };
}
