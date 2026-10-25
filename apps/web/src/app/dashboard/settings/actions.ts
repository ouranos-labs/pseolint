"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { alertDefaults } from "@/db/schema";
import { getRequiredSession } from "@/lib/session";
import { BillingCancelError, deleteUserAccount } from "@/lib/account-deletion";

export async function updateAlertDefaultsAction(formData: FormData): Promise<void> {
  const session = await getRequiredSession();
  const rawThreshold = Number(formData.get("riskRiseThreshold"));
  const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 ? Math.floor(rawThreshold) : 10;
  const rawEmails = String(formData.get("recipientEmails") ?? "");
  const emails = rawEmails.split(",").map((s) => s.trim()).filter(Boolean);

  await db.insert(alertDefaults).values({
    userId: session.user.id, riskRiseThreshold: threshold, recipientEmails: emails,
  }).onConflictDoUpdate({
    target: alertDefaults.userId,
    set: { riskRiseThreshold: threshold, recipientEmails: emails, updatedAt: new Date() },
  });

  revalidatePath("/dashboard/settings/alerts");
}

/**
 * Returns `{ error }` (and deletes nothing) when the subscription couldn't be
 * canceled; on success it redirects, so the return value is only ever an error.
 */
export async function deleteAccountAction(formData: FormData): Promise<{ error: string } | void> {
  const session = await getRequiredSession();
  const confirm = String(formData.get("confirm") ?? "");
  if (confirm !== "DELETE") throw new Error("confirm by typing DELETE");
  try {
    await deleteUserAccount(session.user.id);
  } catch (e) {
    if (e instanceof BillingCancelError) {
      return {
        error:
          "We couldn't cancel your subscription, so your account was not deleted. Try again in a minute or email hello@pseolint.dev.",
      };
    }
    throw e;
  }
  redirect("/?deleted=1");
}
