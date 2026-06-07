import "server-only";
import { clientIp } from "@/lib/ip";
import { verifyMcpKey } from "@/lib/mcp-keys";

export type McpIdentity =
  | { kind: "key"; userId: string }
  | { kind: "anon"; ip: string }
  | { kind: "invalid" };

/**
 * Resolve the caller's identity from the request.
 * - No Authorization header  → anonymous (rate-limited by IP).
 * - `Bearer <valid token>`   → authenticated key identity.
 * - Anything else / bad key  → invalid (route maps to HTTP 401).
 */
export async function resolveMcpIdentity(req: Request): Promise<McpIdentity> {
  const header = req.headers.get("authorization");
  if (!header) return { kind: "anon", ip: clientIp(req) };

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return { kind: "invalid" };

  const result = await verifyMcpKey(match[1].trim());
  return result ? { kind: "key", userId: result.userId } : { kind: "invalid" };
}
