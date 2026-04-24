import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Encrypt a short secret (API key, etc.) using AES-256-GCM with a key derived
 * from BETTER_AUTH_SECRET via scrypt. Not a full KMS — adequate for
 * per-user-key storage in a server-side DB.
 *
 * Output format: base64url("salt(16) | iv(12) | tag(16) | ciphertext").
 */
function keyFor(salt: Buffer): Buffer {
  return scryptSync(env().BETTER_AUTH_SECRET, salt, 32);
}

export function sealSecret(plain: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(salt), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ciphertext]).toString("base64url");
}

const GCM_TAG_LEN = 16;

export function openSecret(sealed: string): string {
  const buf = Buffer.from(sealed, "base64url");
  const salt = buf.subarray(0, 16);
  const iv = buf.subarray(16, 28);
  const tag = buf.subarray(28, 28 + GCM_TAG_LEN);
  if (tag.length !== GCM_TAG_LEN) {
    throw new Error("sealed secret has invalid auth tag length");
  }
  const ciphertext = buf.subarray(28 + GCM_TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", keyFor(salt), iv, { authTagLength: GCM_TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
