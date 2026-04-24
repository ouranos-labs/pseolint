"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAiKeys } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { sealSecret } from "@/lib/secret-box";

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

  revalidatePath("/dashboard/settings/ai-key");
}

export async function removeAiKeyAction(): Promise<void> {
  const session = await requireSession();
  await db.delete(userAiKeys).where(eq(userAiKeys.userId, session.user.id));
  revalidatePath("/dashboard/settings/ai-key");
}
