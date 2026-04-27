"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { deleteReport } from "@/lib/r2";

export async function deleteAuditAction(
  auditSlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  const [row] = await db
    .select({ id: audits.id, storageKey: audits.storageKey })
    .from(audits)
    .where(and(eq(audits.slug, auditSlug), eq(audits.userId, session.user.id)))
    .limit(1);
  if (!row) return { ok: false, error: "not found" };

  if (row.storageKey) {
    // storageKey points at the JSON summary for new rows, or the legacy .html for older rows.
    // Best-effort delete both extensions so we don't orphan either.
    const sibling = row.storageKey.endsWith(".json")
      ? row.storageKey.replace(/\.json$/, ".html")
      : row.storageKey.replace(/\.html$/, ".json");
    try { await deleteReport(row.storageKey); } catch { /* row removal is the source of truth */ }
    try { await deleteReport(sibling); } catch { /* best-effort */ }
  }

  await db.delete(audits).where(eq(audits.id, row.id));

  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath(`/r/${auditSlug}`);
  return { ok: true };
}
