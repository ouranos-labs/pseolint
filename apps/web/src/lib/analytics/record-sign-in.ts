import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getPlan } from "@/lib/plan";
import { identifyServer, trackServer } from "./track.server";

const NEW_USER_WINDOW_MS = 60_000;

/**
 * Identify a freshly-signed-in user and emit signed_in. Called from
 * better-auth's session.create.after.
 *
 * This used to also `alias()` the anon cookie id onto the account. That call
 * was dead: `OpenPanel.alias()` has an empty body in the SDK. Anonymous history
 * attaches through `identify()` on the same device instead, which the root
 * layout performs by handing the provider `session.user.id` on the next render.
 * isNewUser is a 60s-createdAt heuristic: approximate by design; analytics,
 * not authorization. Never throws (sign-in must not depend on analytics).
 */
export async function recordSignIn(userId: string): Promise<void> {
  try {
    const [u] = await db
      .select({ email: users.email, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const isNewUser = u?.createdAt
      ? Date.now() - new Date(u.createdAt).getTime() < NEW_USER_WINDOW_MS
      : false;
    const plan = await getPlan(userId);

    await identifyServer({ profileId: userId, email: u?.email, properties: { plan } });
    await trackServer({ name: "signed_in", props: { isNewUser } }, { profileId: userId });
  } catch {
    /* analytics must never block sign-in */
  }
}
