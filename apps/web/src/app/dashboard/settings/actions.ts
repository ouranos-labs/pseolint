"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { alertDefaults } from "@/db/schema";
import { getRequiredSession } from "@/lib/session";
import { BillingCancelError, deleteUserAccount } from "@/lib/account-deletion";
import { type ActionResult, NOTHING_SAVED, isPlausibleEmail } from "@/lib/action-result";

export async function updateAlertDefaultsAction(formData: FormData): Promise<ActionResult> {
  const session = await getRequiredSession();
  // Reject bad input instead of quietly saving a default the user never typed.
  const thresholdRaw = String(formData.get("riskRiseThreshold") ?? "").trim();
  const threshold = Number(thresholdRaw);
  if (!thresholdRaw || !Number.isInteger(threshold) || threshold < 1) {
    return { ok: false, field: "riskRiseThreshold", error: `Risk rise threshold must be a whole number of 1 or more. ${NOTHING_SAVED}` };
  }
  const rawEmails = String(formData.get("recipientEmails") ?? "");
  const emails = rawEmails.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = emails.filter((e) => !isPlausibleEmail(e));
  if (bad.length > 0) {
    return {
      ok: false,
      field: "recipientEmails",
      error: `${bad.map((e) => `"${e}"`).join(", ")} ${bad.length === 1 ? "isn't a valid email address" : "aren't valid email addresses"}. ${NOTHING_SAVED}`,
    };
  }

  await db.insert(alertDefaults).values({
    userId: session.user.id, riskRiseThreshold: threshold, recipientEmails: emails,
  }).onConflictDoUpdate({
    target: alertDefaults.userId,
    set: { riskRiseThreshold: threshold, recipientEmails: emails, updatedAt: new Date() },
  });

  revalidatePath("/dashboard/settings/alerts");
  return { ok: true, message: "Alert defaults saved." };
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
