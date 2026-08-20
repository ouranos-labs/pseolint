import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getPlan } from "@/lib/plan";
import { identifyServer, aliasServer, trackServer } from "./track.server";

const ANON_COOKIE = "pseolint_anon";
const NEW_USER_WINDOW_MS = 60_000;

/**
 * Stitch a freshly-signed-in user to their prior anonymous activity and emit
 * signed_in. Called from better-auth's session.create.after, BEFORE
 * claimAnonAudits clears the anon cookie (so the alias still has the id).
 * isNewUser is a 60s-createdAt heuristic: approximate by design; analytics,
 * not authorization. Never throws (sign-in must not depend on analytics).
 */
export async function recordSignIn(userId: string): Promise<void> {
  try {
    const store = await cookies();
    const anonId = store.get(ANON_COOKIE)?.value;
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
    if (anonId && /^[a-zA-Z0-9_-]{21}$/.test(anonId)) {
      await aliasServer({ profileId: userId, alias: anonId });
    }
    await trackServer({ name: "signed_in", props: { isNewUser } }, { profileId: userId });
  } catch {
    /* analytics must never block sign-in */
  }
}
