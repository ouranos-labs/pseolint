"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { uploadTokens } from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { getRequiredSession } from "@/lib/session";
import { createUploadToken } from "@/lib/upload-token";

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
  revalidatePath("/dashboard/settings/tokens");
  return { token };
}

export async function revokeToken(id: string): Promise<void> {
  const session = await getRequiredSession();
  await db.update(uploadTokens).set({ revokedAt: new Date() })
    .where(and(eq(uploadTokens.id, id), eq(uploadTokens.userId, session.user.id)));
  revalidatePath("/dashboard/settings/tokens");
}
