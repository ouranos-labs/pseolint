import { promises as dns } from "node:dns";
import { randomBytes } from "node:crypto";

/**
 * Token value users embed in a DNS TXT record to prove ownership of a monitored
 * domain. 16 hex chars = 64 bits of entropy: unguessable, human-copyable.
 */
export function generateVerificationToken(): string {
  return randomBytes(8).toString("hex");
}

/**
 * TXT record name to query. Uses an underscore-prefixed subdomain
 * (`_pseolint-verify.<host>`) so we never collide with the site's own root
 * TXT records (SPF, DMARC, etc.).
 */
export function verifyTxtName(host: string): string {
  return `_pseolint-verify.${host}`;
}

/**
 * True when the DNS TXT record at `_pseolint-verify.<host>` contains a value
 * matching `token`. Returns false (not throws) on NXDOMAIN / lookup errors so
 * the caller can distinguish "not set up yet" from "doesn't match."
 */
export async function verifyDomainToken(host: string, token: string): Promise<boolean> {
  try {
    // Node's resolveTxt returns string[][]; each entry is a chunked record.
    const records = await dns.resolveTxt(verifyTxtName(host));
    for (const chunks of records) {
      const joined = chunks.join("");
      if (joined === token) return true;
    }
    return false;
  } catch {
    return false;
  }
}
