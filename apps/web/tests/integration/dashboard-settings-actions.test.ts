/**
 * Dashboard settings + findings actions, driven through a recording db mock so
 * they run without Postgres. Ownership scoping against real SQL lives in
 * destructive-actions.test.ts (DB-gated); this suite pins the behaviour that
 * the UI relies on:
 *
 *  - saving domain settings while the GSC <select> is absent (Google
 *    unreachable) must NOT unbind Search Console; only an explicit empty
 *    selection unbinds;
 *  - validation failures come back as { ok: false, field } and write nothing,
 *    instead of throwing to the route error boundary;
 *  - restoreFinding (the Undo behind "Finding dismissed. Undo") reopens the
 *    finding and refuses a foreign one.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const S = vi.hoisted(() => ({
  session: { user: { id: "user-A", email: "a@example.test" } } as { user: { id: string; email: string } } | null,
  /** Rows returned by the next select(...).limit() calls, in order. */
  selectQueue: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/session", () => {
  const required = async () => {
    if (!S.session) throw new Error("Unauthorized");
    return S.session;
  };
  return { requireSession: required, getRequiredSession: required, getOptionalSession: async () => S.session };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));
vi.mock("@/lib/audit-log", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ BETTER_AUTH_URL: "http://localhost" }) }));
vi.mock("@/lib/gsc", () => ({ listSites: vi.fn(async () => []), pickBestGscProperty: vi.fn(() => null) }));
vi.mock("@/lib/slack-notify", () => ({
  validateSlackWebhookUrl: (u: string) =>
    u.startsWith("https://hooks.slack.com/") ? { ok: true } : { ok: false, reason: "must start with https://hooks.slack.com/" },
  sendSlackAlert: vi.fn(async () => undefined),
}));

vi.mock("@/db", () => {
  // Any select chain resolves to the next queued row set, whether it ends in
  // .limit() or is awaited after .where().
  const selectChain = () => {
    const next = async () => S.selectQueue.shift() ?? [];
    const terminal = {
      limit: next,
      then: (ok: (v: unknown[]) => unknown, err?: (e: unknown) => unknown) => next().then(ok, err),
    };
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => terminal,
    };
    return chain;
  };
  const db = {
    select: () => selectChain(),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        S.updates.push(values);
        const done = Promise.resolve([{ id: "row" }]);
        return { where: () => Object.assign(done, { returning: async () => [{ id: "row" }] }) };
      },
    }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
    delete: () => ({ where: async () => undefined }),
  };
  return { db };
});

const { updateDomainSettingsAction, updateScanOptionsAction, updateSlackWebhookAction } = await import(
  "@/app/dashboard/[host]/settings/actions"
);
const { restoreFinding } = await import("@/app/dashboard/_actions/findings");
const { jsonErrorMessage } = await import("@/lib/action-result");

function settingsForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  fd.append("domainHost", "example.com");
  fd.append("alertThreshold", "10");
  fd.append("alertEmail", "");
  fd.append("authorityScore", "");
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  S.session = { user: { id: "user-A", email: "a@example.test" } };
  S.selectQueue = [];
  S.updates = [];
});

describe("updateDomainSettingsAction: Search Console binding", () => {
  it("keeps the binding when the gscSiteUrl field is absent (Google unreachable)", async () => {
    S.selectQueue.push([{ gscSiteUrl: "sc-domain:example.com" }]);
    const res = await updateDomainSettingsAction(settingsForm({ alertThreshold: "15" }));

    expect(res).toEqual({ ok: true, message: "Settings saved." });
    expect(S.updates).toHaveLength(1);
    expect(S.updates[0].alertThreshold).toBe(15);
    // The regression: absent used to be read as "" and written as null.
    expect(S.updates[0]).not.toHaveProperty("gscSiteUrl");
  });

  it("keeps the binding when the hidden input carries the current value through", async () => {
    S.selectQueue.push([{ gscSiteUrl: "sc-domain:example.com" }]);
    const res = await updateDomainSettingsAction(settingsForm({ gscSiteUrl: "sc-domain:example.com" }));
    expect(res.ok).toBe(true);
    expect(S.updates[0].gscSiteUrl).toBe("sc-domain:example.com");
  });

  it("unbinds only on an explicit empty selection", async () => {
    S.selectQueue.push([{ gscSiteUrl: "sc-domain:example.com" }]);
    const res = await updateDomainSettingsAction(settingsForm({ gscSiteUrl: "" }));
    expect(res.ok).toBe(true);
    expect(S.updates[0].gscSiteUrl).toBeNull();
    if (res.ok) expect(res.message).toMatch(/unbound/i);
  });

  it("binds a newly selected property and says so", async () => {
    S.selectQueue.push([{ gscSiteUrl: null }]);
    const res = await updateDomainSettingsAction(settingsForm({ gscSiteUrl: "https://example.com/" }));
    expect(S.updates[0].gscSiteUrl).toBe("https://example.com/");
    if (res.ok) expect(res.message).toContain("Bound to https://example.com/");
  });
});

describe("updateDomainSettingsAction: validation returns, never throws", () => {
  it("rejects a non-integer threshold on its field and writes nothing", async () => {
    const res = await updateDomainSettingsAction(settingsForm({ alertThreshold: "abc" }));
    expect(res).toMatchObject({ ok: false, field: "alertThreshold" });
    if (!res.ok) expect(res.error).toContain("Nothing was saved.");
    expect(S.updates).toHaveLength(0);
  });

  it("rejects a malformed email override", async () => {
    const res = await updateDomainSettingsAction(settingsForm({ alertEmail: "not-an-email" }));
    expect(res).toMatchObject({ ok: false, field: "alertEmail" });
    expect(S.updates).toHaveLength(0);
  });

  it("reports a missing domain as a sentence instead of throwing", async () => {
    S.selectQueue.push([]);
    const res = await updateDomainSettingsAction(settingsForm({}));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no longer in your workspace/i);
  });
});

describe("updateScanOptionsAction / updateSlackWebhookAction", () => {
  it("points a JSON syntax error at the field and line", async () => {
    S.selectQueue.push([{ id: "dom-1" }]);
    const fd = new FormData();
    fd.append("domainHost", "example.com");
    fd.append("pageGroupsJson", '{\n  "landing": {\n    "match": "/lp/*",,\n  }\n}');
    const res = await updateScanOptionsAction(fd);
    expect(res).toMatchObject({ ok: false, field: "pageGroupsJson" });
    if (!res.ok) expect(res.error).toMatch(/^Page groups isn't valid JSON \(line 3\)\. Nothing was saved\.$/);
    expect(S.updates).toHaveLength(0);
  });

  it("returns a field error for a non-Slack webhook URL", async () => {
    const fd = new FormData();
    fd.append("domainHost", "example.com");
    fd.append("slackWebhookUrl", "https://evil.example/hook");
    const res = await updateSlackWebhookAction(fd);
    expect(res).toMatchObject({ ok: false, field: "slackWebhookUrl" });
    expect(S.updates).toHaveLength(0);
  });

  it("confirms a saved webhook", async () => {
    const fd = new FormData();
    fd.append("domainHost", "example.com");
    fd.append("slackWebhookUrl", "https://hooks.slack.com/services/T/B/x");
    expect(await updateSlackWebhookAction(fd)).toEqual({ ok: true, message: "Webhook saved." });
  });
});

describe("restoreFinding (Undo for snooze / dismiss)", () => {
  it("reopens the owner's finding and clears the snooze date", async () => {
    S.selectQueue.push([{ uid: "user-A" }]);
    await restoreFinding("f-1");
    expect(S.updates).toEqual([{ status: "open", snoozeUntil: null }]);
  });

  it("refuses another user's finding without writing", async () => {
    S.selectQueue.push([{ uid: "user-B" }]);
    await expect(restoreFinding("f-1")).rejects.toThrow("not found");
    expect(S.updates).toHaveLength(0);
  });
});

describe("jsonErrorMessage", () => {
  it("derives the line from a position-only error", () => {
    const raw = '[\n1,\n2,,\n]';
    const err = new SyntaxError(`Unexpected token , in JSON at position ${raw.indexOf(",,") + 1}`);
    expect(jsonErrorMessage("The dataset", raw, err)).toBe("The dataset isn't valid JSON (line 3). Nothing was saved.");
  });
});
