import { createHash } from "node:crypto";
import { env } from "@/lib/env";

export function hashIp(ip: string): string {
  return createHash("sha256").update(env().IP_HASH_SALT + "|" + ip).digest("hex").slice(0, 32);
}

export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}

export function todayDateString(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
