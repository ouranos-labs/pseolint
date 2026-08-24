/**
 * Ownership gate on the domain-add path.
 *
 * The invariant under test: pseolint never crawls a host the caller hasn't
 * proven they control. `addDomainAction` used to queue a 500-page audit the
 * instant a domain was typed in, which made "monitoring" reachable for any
 * third-party site. The gate is what replaced that, so it needs a test that
 * fails loudly if the enqueue ever creeps back above the check.
 *
 * `@/lib/gsc` is imported for real (only `listSites`, which does network I/O, is
 * stubbed) so `pickBestGscProperty` + `provesGscOwnership` are the real
 * implementations here: auto-verification is the one path that can *grant*
 * verification, so it must not be tested against a reimplementation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GscSite } from "@/lib/gsc";

type DomRow = { id: string; gscSiteUrl: string | null; verifiedAt: Date | null };

const STATE: {
  session: { user: { id: string; email: string } } | null;
  /** Row returned by the pre-upsert `{ removedAt }` lookup; null = new domain. */
  existing: { removedAt: Date | null } | null;
  /** Row returned by the post-upsert `{ id, gscSiteUrl, verifiedAt }` lookup. */
  domRow: DomRow | null;
  gscConnected: boolean;
  sites: GscSite[];
  /** Make the stubbed `listSites` reject, standing in for revoked perms. */
  gscThrows: boolean;
  /** Payloads passed to `db.update(monitoredDomains).set(...)`. */
  updates: Record<string, unknown>[];
  auditInserts: number;
  sent: { name: string; data: Record<string, unknown> }[];
} = {
  session: null,
  existing: null,
  domRow: null,
  gscConnected: false,
  sites: [],
  gscThrows: false,
  updates: [],
  auditInserts: 0,
  sent: [],
};

vi.mock("@/db/schema", () => ({
  monitoredDomains: { id: {}, userId: {}, host: {}, sourceUrl: {}, removedAt: {}, verifiedAt: {}, gscSiteUrl: {} },
  audits: { id: {}, slug: {}, sourceUrl: {}, userId: {}, status: {}, expiresAt: {}, isPublic: {} },
  watchedPages: { id: {}, monitoredDomainId: {}, url: {} },
  integrations: { id: {}, userId: {}, kind: {} },
}));

// Routes each SELECT by table identity + the shape's keys: the action queries
// monitored_domain three times with three different projections.
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");

  const rowsFor = (table: unknown, shape?: Record<string, unknown>): unknown[] => {
    if (table === schema.integrations) return STATE.gscConnected ? [{ id: "int-1" }] : [];
    if (table !== schema.monitoredDomains) return [];
    if (shape && "active" in shape) return [{ active: 0 }];
    if (shape && "removedAt" in shape) return STATE.existing ? [STATE.existing] : [];
    if (shape && "gscSiteUrl" in shape) return STATE.domRow ? [STATE.domRow] : [];
    return [];
  };

  const mockDb = {
    select: (shape?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const resolve = async () => rowsFor(table, shape);
        return {
          where: () => ({
            // The active-domain count is awaited directly; the rest chain .limit.
            then: (ok: (v: unknown[]) => unknown, err?: (e: unknown) => unknown) => resolve().then(ok, err),
            limit: async () => resolve(),
          }),
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (_v: unknown) => {
        if (table === schema.audits) STATE.auditInserts++;
        return { returning: async () => [{ id: "audit-1" }] };
      },
    }),
    update: (_table: unknown) => ({
      set: (v: Record<string, unknown>) => {
        STATE.updates.push(v);
        return { where: async () => undefined };
      },
    }),
  };
  return { db: mockDb };
});

vi.mock("@/lib/session", () => ({
  requireSession: async () => {
    if (!STATE.session) throw new Error("Unauthorized");
    return STATE.session;
  },
}));
vi.mock("@/lib/ssrf", () => ({ assertSafeUrl: async () => undefined }));
vi.mock("@/lib/inngest", () => ({
  inngest: {
    send: async (evt: { name: string; data: Record<string, unknown> }) => {
      STATE.sent.push(evt);
      return { ids: ["e1"] };
    },
  },
}));
vi.mock("@/lib/slug", () => ({ publicSlug: () => "slug_1" }));
vi.mock("@/lib/audit-log", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/plan", () => ({ getPlan: async () => "pro" }));
vi.mock("@/lib/audit-gate", () => ({ assertProAuditAllowed: async () => null }));
vi.mock("@/lib/monitoring", () => ({ loadWatchedUrlsForDomain: async () => [] }));
vi.mock("@/lib/domain-verify", () => ({
  generateVerificationToken: () => "tok",
  verifyDomainToken: async () => true,
}));
// Critical: with the dev bypass on, fresh rows are stamped verified at insert
// and the gate under test would never engage.
vi.mock("@/lib/dev-flags", () => ({
  devFlags: { domainVerifySkipped: false, rateLimitDisabled: false, inngestLocal: false, preflightDisabled: false },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/gsc", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gsc")>("@/lib/gsc");
  return {
    ...actual,
    listSites: async () => {
      if (STATE.gscThrows) throw new Error("GSC sites.list failed: 403");
      return STATE.sites;
    },
  };
});

const site = (siteUrl: string, permissionLevel: string): GscSite => ({ siteUrl, permissionLevel });

async function addDomain(url = "example.com") {
  const { addDomainAction } = await import("@/app/dashboard/domain-actions");
  return addDomainAction(url);
}

beforeEach(() => {
  STATE.session = { user: { id: "user-A", email: "a@x" } };
  STATE.existing = null;
  STATE.domRow = { id: "dom-1", gscSiteUrl: null, verifiedAt: null };
  STATE.gscConnected = false;
  STATE.sites = [];
  STATE.gscThrows = false;
  STATE.updates = [];
  STATE.auditInserts = 0;
  STATE.sent = [];
});

describe("addDomainAction ownership gate", () => {
  it("queues no crawl for an unverified domain", async () => {
    const res = await addDomain();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.host).toBe("example.com");
      // Null auditId is the contract the callers branch on to show the banner.
      expect(res.auditId).toBeNull();
    }
    expect(STATE.sent).toHaveLength(0);
    expect(STATE.auditInserts).toBe(0);
  });

  it("queues the kickoff audit once the domain is verified", async () => {
    STATE.domRow = { id: "dom-1", gscSiteUrl: "https://example.com/", verifiedAt: new Date() };
    const res = await addDomain();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.auditId).toBe("audit-1");
    expect(STATE.sent).toHaveLength(1);
    expect(STATE.sent[0].name).toBe("audit/requested");
    expect(STATE.sent[0].data).toMatchObject({ url: "https://example.com", plan: "pro", sampleSize: 500 });
  });

  it("verifies via a Search Console property the user owns, then crawls", async () => {
    STATE.gscConnected = true;
    STATE.sites = [site("https://example.com/", "siteOwner")];
    const res = await addDomain();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.auditId).toBe("audit-1");
    // Ownership stamped alongside the binding, and the crawl followed.
    expect(STATE.updates.at(-1)).toMatchObject({ gscSiteUrl: "https://example.com/" });
    expect(STATE.updates.at(-1)?.verifiedAt).toBeInstanceOf(Date);
    expect(STATE.sent).toHaveLength(1);
  });

  it("binds but does NOT verify a restricted-access property", async () => {
    STATE.gscConnected = true;
    STATE.sites = [site("https://example.com/", "siteRestrictedUser")];
    const res = await addDomain();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.auditId).toBeNull();
    expect(STATE.updates.at(-1)).toMatchObject({ gscSiteUrl: "https://example.com/" });
    expect(STATE.updates.at(-1)?.verifiedAt).toBeUndefined();
    expect(STATE.sent).toHaveLength(0);
  });

  it("does not verify from a property belonging to a different host", async () => {
    STATE.gscConnected = true;
    STATE.sites = [site("https://other.com/", "siteOwner")];
    const res = await addDomain();
    if (res.ok) expect(res.auditId).toBeNull();
    expect(STATE.updates).toHaveLength(0);
    expect(STATE.sent).toHaveLength(0);
  });

  it("does not verify from an ambiguous property match", async () => {
    STATE.gscConnected = true;
    // Two root properties for the same naked host tie on confidence, so
    // pickBestGscProperty refuses to choose, and nothing gets verified.
    STATE.sites = [
      site("https://example.com/", "siteOwner"),
      site("http://example.com/", "siteOwner"),
    ];
    const res = await addDomain();
    if (res.ok) expect(res.auditId).toBeNull();
    expect(STATE.sent).toHaveLength(0);
  });

  it("ignores a GSC lookup failure and stays unverified", async () => {
    STATE.gscConnected = true;
    STATE.gscThrows = true;
    const res = await addDomain();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.auditId).toBeNull();
    expect(STATE.sent).toHaveLength(0);
  });

  it("re-arms verification when a removed domain is re-added", async () => {
    STATE.existing = { removedAt: new Date() };
    await addDomain();
    // The reactivate branch must clear verifiedAt and issue a fresh token,
    // otherwise a re-add would inherit a stale proof.
    expect(STATE.updates[0]).toMatchObject({ verifiedAt: null, verificationToken: "tok" });
    expect(STATE.sent).toHaveLength(0);
  });

  it("rejects unauthenticated callers", async () => {
    STATE.session = null;
    const res = await addDomain();
    expect(res.ok).toBe(false);
    expect(STATE.sent).toHaveLength(0);
  });
});

describe("provesGscOwnership", () => {
  it.each([
    ["siteOwner", true],
    ["siteFullUser", true],
    ["siteRestrictedUser", false],
    ["siteUnverifiedUser", false],
  ] as const)("%s -> %s", async (permissionLevel, expected) => {
    const { provesGscOwnership } = await import("@/lib/gsc");
    expect(provesGscOwnership(site("https://example.com/", permissionLevel))).toBe(expected);
  });
});
