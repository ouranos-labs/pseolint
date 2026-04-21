import { randomBytes, timingSafeEqual, createHash } from "node:crypto";

const PREFIX = "pslt_";

export async function createUploadToken(): Promise<{ token: string; hash: string }> {
  const raw = randomBytes(32).toString("base64url");
  const token = `${PREFIX}${raw}`;
  const hash = createHash("sha256").update(token, "utf8").digest("hex");
  return { token, hash };
}

export async function verifyUploadToken(token: string, expectedHash: string): Promise<boolean> {
  if (!token.startsWith(PREFIX)) return false;
  const h = createHash("sha256").update(token, "utf8").digest("hex");
  const a = Buffer.from(h, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
