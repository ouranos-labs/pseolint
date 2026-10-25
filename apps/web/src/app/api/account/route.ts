import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { BillingCancelError, deleteUserAccount } from "@/lib/account-deletion";

export const runtime = "nodejs";

export async function DELETE(_req: Request): Promise<Response> {
  let session;
  try { session = await requireSession(); } catch (r) { return r as Response; }
  try {
    await deleteUserAccount(session.user.id);
  } catch (e) {
    if (e instanceof BillingCancelError) {
      return NextResponse.json({ error: "billing_cancel_failed" }, { status: 502 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
