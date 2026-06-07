import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { hashIp } from "@/lib/ip";
import type { McpIdentity } from "@/lib/mcp-auth";

/** Minimal shape we depend on — lets tests inject fakes without a live Redis. */
export interface LimiterLike {
  limit(key: string): Promise<{ success: boolean; reset: number }>;
}

export interface Limiters {
  anon: LimiterLike;
  keyed: LimiterLike;
}

// Lazily built so importing this module never requires Upstash env at load time
// (keeps unit tests and `next build` happy). `Redis.fromEnv()` reads
// KV_REST_API_URL / KV_REST_API_TOKEN (provisioned via the Vercel/Upstash integration).
let cached: Limiters | undefined;
function defaultLimiters(): Limiters {
  if (cached) return cached;
  const redis = Redis.fromEnv();
  cached = {
    anon: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "10 m"), prefix: "mcp" }),
    keyed: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(200, "10 m"), prefix: "mcp" }),
  };
  return cached;
}

export interface RateResult {
  success: boolean;
  retryAfterSeconds: number;
}

/**
 * Apply the rate limit for an identity. Anonymous → per-hashed-IP bucket;
 * authenticated → per-userId bucket. `invalid` identities never reach here
 * (the route rejects them with 401 first).
 */
export async function checkMcpRateLimit(
  identity: McpIdentity,
  limiters: Limiters = defaultLimiters(),
): Promise<RateResult> {
  let res: { success: boolean; reset: number };
  if (identity.kind === "key") {
    res = await limiters.keyed.limit(`mcp:key:${identity.userId}`);
  } else if (identity.kind === "anon") {
    res = await limiters.anon.limit(`mcp:anon:${hashIp(identity.ip)}`);
  } else {
    return { success: true, retryAfterSeconds: 0 }; // unreachable; defensive
  }
  const retryAfterSeconds = Math.max(0, Math.ceil((res.reset - Date.now()) / 1000));
  return { success: res.success, retryAfterSeconds };
}
