import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { reserveAnonAuditSlot, ANON_DAILY_CAP } from "@/lib/audit-limits";
import { hashIp } from "@/lib/ip";
import { like } from "drizzle-orm";
import { RUN_DB_INTEGRATION } from "../util/db-integration";

const IP = "203.0.113.42";

describe.skipIf(!RUN_DB_INTEGRATION)("anon audit rate limit", () => {
  beforeEach(async () => {
    await db.delete(rateLimits).where(like(rateLimits.key, `anon:audit:${hashIp(IP)}:%`));
  });

  it("allows up to the cap, rejects beyond", async () => {
    for (let i = 1; i <= ANON_DAILY_CAP; i++) {
      const count = await reserveAnonAuditSlot(IP);
      expect(count).toBe(i);
    }
    expect(await reserveAnonAuditSlot(IP)).toBeNull();
  });
});
