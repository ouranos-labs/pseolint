import "server-only";
import { headers, cookies } from "next/headers";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth";

export async function getOptionalSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getOptionalSession();
  if (!session) throw new Response("Unauthorized", { status: 401 });
  return session;
}

/** Thin wrapper for use in server actions — throws a plain Error when unauthenticated. */
export async function getRequiredSession() {
  const session = await getOptionalSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

const ANON_COOKIE = "pseolint_anon";

/**
 * READ-ONLY: Returns the existing anon session ID from the cookie store,
 * or null if none exists. Safe to call from RSC render passes (no cookie write).
 */
export async function getAnonSessionId(): Promise<string | null> {
  const store = await cookies();
  const existing = store.get(ANON_COOKIE)?.value;
  return existing && /^[a-zA-Z0-9_-]{21}$/.test(existing) ? existing : null;
}

/**
 * READ-WRITE: Returns the existing anon session ID, creating and persisting
 * a new one if none exists. MUST only be called from a Server Action or
 * Route Handler — calling this during an RSC render pass will throw in Next.js 15+.
 */
export async function getOrCreateAnonSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(ANON_COOKIE)?.value;
  if (existing && /^[a-zA-Z0-9_-]{21}$/.test(existing)) return existing;
  const id = nanoid(21);
  store.set(ANON_COOKIE, id, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, path: "/",
  });
  return id;
}
