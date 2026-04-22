import { describe, it, expect, beforeAll } from "vitest";
import { POST } from "@/app/api/audits/upload/route";
import { db } from "@/db";
import { uploadTokens, monitoredDomains, users, findingsState } from "@/db/schema";
import { createUploadToken } from "@/lib/upload-token";
import { publicSlug } from "@/lib/slug";
import { eq } from "drizzle-orm";

describe("POST /api/audits/upload", () => {
  let token: string;
  let userId: string;
  let domainId: string;

  beforeAll(async () => {
    userId = `u_${Math.random().toString(36).slice(2, 10)}`;
    await db.insert(users).values({ id: userId, name: userId, email: `${userId}@ex.test`, emailVerified: false });
    const [d] = await db
      .insert(monitoredDomains)
      .values({ slug: publicSlug(), userId, sourceUrl: "https://ex.com", host: "ex.com" })
      .returning();
    domainId = d.id;
    const { token: t, hash } = await createUploadToken();
    token = t;
    await db.insert(uploadTokens).values({ userId, label: "test", tokenHash: hash });
  });

  it("401 without token", async () => {
    const res = await POST(new Request("http://localhost/api/audits/upload", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("ingests a valid report into findings_state", async () => {
    const body = JSON.stringify({
      domainId,
      summary: {
        score: 72,
        categoryScores: {},
        pageCount: 10,
        findings: [
          { ruleId: "spam/thin-content", severity: "warning", message: "thin", pageUrl: "https://ex.com/p/1" },
        ],
      },
    });
    const res = await POST(
      new Request("http://localhost/api/audits/upload", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body,
      }),
    );
    expect(res.status).toBe(200);
    const rows = await db.select().from(findingsState).where(eq(findingsState.domainId, domainId));
    expect(rows.some((r) => r.ruleId === "spam/thin-content")).toBe(true);
  });
});
