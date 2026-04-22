"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { alertDefaults, users } from "@/db/schema";
import { getRequiredSession } from "@/lib/session";

export async function updateAlertDefaultsAction(formData: FormData): Promise<void> {
  const session = await getRequiredSession();
  const rawThreshold = Number(formData.get("scoreDropThreshold"));
  const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 ? Math.floor(rawThreshold) : 10;
  const rawEmails = String(formData.get("recipientEmails") ?? "");
  const emails = rawEmails.split(",").map((s) => s.trim()).filter(Boolean);

  await db.insert(alertDefaults).values({
    userId: session.user.id, scoreDropThreshold: threshold, recipientEmails: emails,
  }).onConflictDoUpdate({
    target: alertDefaults.userId,
    set: { scoreDropThreshold: threshold, recipientEmails: emails, updatedAt: new Date() },
  });

  revalidatePath("/dashboard/settings/alerts");
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const session = await getRequiredSession();
  const confirm = String(formData.get("confirm") ?? "");
  if (confirm !== "DELETE") throw new Error("confirm by typing DELETE");
  await db.delete(users).where(eq(users.id, session.user.id));
  redirect("/?deleted=1");
}
