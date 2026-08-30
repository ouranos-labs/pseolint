"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { uploadTokens, userAiKeys } from "@/db/schema";
import { getRequiredSession, requireSession } from "@/lib/session";
import { createUploadToken } from "@/lib/upload-token";
import { sealSecret } from "@/lib/secret-box";

/**
 * Every credential action for /dashboard/api-keys, merged from the two routes
 * this page replaced (settings/tokens and settings/ai-key). One file because
 * one page owns all of them now, and `revalidatePath` has a single target
 * instead of three that each had to be kept in sync with its own route.
 *
 * MCP keys are NOT here: they are managed by McpKeysCard against the existing
 * /api/mcp-keys route handler, which predates this page and is also used by
 * non-browser callers.
 */

// ── Upload tokens (pseolint CLI + GitHub Action) ────────────────────────────

export async function generateToken(label: string): Promise<{ token: string }> {
  const session = await getRequiredSession();
  if (!label.trim()) throw new Error("label required");

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(uploadTokens)
    .where(and(eq(uploadTokens.userId, session.user.id), isNull(uploadTokens.revokedAt)));

  if (count >= 100) {
    throw new Error("Token limit reached (100 active tokens max). Revoke an unused token first.");
  }

  const { token, hash } = await createUploadToken();
  await db.insert(uploadTokens).values({ userId: session.user.id, label: label.trim(), tokenHash: hash });
  revalidatePath("/dashboard/api-keys");
  return { token };
}

export async function revokeToken(id: string): Promise<void> {
  const session = await getRequiredSession();
  await db.update(uploadTokens).set({ revokedAt: new Date() })
    .where(and(eq(uploadTokens.id, id), eq(uploadTokens.userId, session.user.id)));
  revalidatePath("/dashboard/api-keys");
}

// ── Bring-your-own AI provider key ──────────────────────────────────────────

const ALLOWED_PROVIDERS = new Set(["anthropic", "openai", "google", "ollama"]);

export async function saveAiKeyAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const provider = String(formData.get("provider") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const modelRaw = String(formData.get("model") ?? "").trim();
  const model = modelRaw.length ? modelRaw : null;

  if (!ALLOWED_PROVIDERS.has(provider)) throw new Error(`unsupported provider: ${provider}`);
  if (apiKey.length < 8) throw new Error("api key too short");

  const sealed = sealSecret(apiKey);

  await db.insert(userAiKeys).values({
    userId: session.user.id, provider, model, apiKey: sealed,
  }).onConflictDoUpdate({
    target: userAiKeys.userId,
    set: { provider, model, apiKey: sealed, updatedAt: new Date() },
  });

  revalidatePath("/dashboard/api-keys");
}

export async function removeAiKeyAction(): Promise<void> {
  const session = await requireSession();
  await db.delete(userAiKeys).where(eq(userAiKeys.userId, session.user.id));
  revalidatePath("/dashboard/api-keys");
}
