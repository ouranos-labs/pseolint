import { env } from "@/lib/env";
const ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(token: string, ip: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret: env().TURNSTILE_SECRET_KEY, response: token, remoteip: ip });
    const res = await fetch(ENDPOINT, { method: "POST", body });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch { return false; }
}
