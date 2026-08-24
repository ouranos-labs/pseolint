# pseolint Pro Reframe v1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1 of the reframed Pro dashboard: hosted findings state, diff+full scheduler, upload endpoint, three dashboard surfaces (portfolio strip / fix queue / integrations panel), CMS-aware messages, gated alerts, and weekly digest email, all on top of the existing OSS engine without hiding OSS capabilities behind Pro.

**Architecture:** Extend the existing Inngest `monitor-domains` hourly cron to run daily diff-audits + weekly full re-audits against every monitored domain. Audit outputs merge into a new `findings_state` table keyed on `(domain_id, rule_id, template_signature)`; the fix queue reads from this table, ranked by `impressions × severity × page_count` (GSC-weighted once Search Console is connected in v1.1, severity×pages fallback in v1). A new `pseolint upload` CLI command POSTs OSS audit JSON to `/api/audits/upload` for CI integration without coupling the OSS core to Pro. Rule messages are rewritten by a CMS-aware translation layer when URLs match known CMS patterns.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM (Postgres), Inngest (cron + workflows), `@pseolint/core` (audit engine), React Email + Resend (digest), shadcn/ui components, Vitest (tests).

**Spec reference:** `docs/superpowers/specs/2026-04-21-pseolint-pro-reframe-design.md`

---

## File Structure

**Create:**
- `apps/web/src/db/migrations/0003_findings_and_integrations.sql`: schema migration
- `apps/web/src/lib/findings-state.ts`: upsert/merge logic, rank scoring, template signature
- `apps/web/src/lib/cms-messages.ts`: CMS pattern detection + message rewrite
- `apps/web/src/lib/alert-gate.ts`: evaluate score delta + new-combination conditions
- `apps/web/src/lib/upload-token.ts`: token generation, bcrypt hash, verify
- `apps/web/src/app/api/audits/upload/route.ts`: CLI upload ingestion endpoint
- `apps/web/src/app/dashboard/queue/page.tsx`: fix queue (paginated)
- `apps/web/src/app/dashboard/queue/actions.ts`: snooze/dismiss server actions
- `apps/web/src/app/dashboard/integrations/page.tsx`: integrations panel
- `apps/web/src/app/dashboard/settings/tokens/page.tsx`: upload token management
- `apps/web/src/app/api/dashboard/queue/export.csv/route.ts`: CSV export
- `apps/web/src/emails/WeeklyDigestEmail.tsx`: digest template
- `apps/web/src/lib/digest-email.ts`: digest composer + send
- `apps/web/src/inngest/functions/weekly-digest.ts`: Monday 06:00 UTC cron
- `apps/web/tests/integration/findings-state.test.ts`
- `apps/web/tests/integration/upload-endpoint.test.ts`
- `apps/web/tests/integration/alert-gate.test.ts`
- `apps/web/tests/unit/cms-messages.test.ts`
- `packages/cli/src/commands/upload.ts`: `pseolint upload` subcommand
- `packages/core/src/rules/scope.ts`: declarative scope annotation map

**Modify:**
- `apps/web/src/db/schema.ts`: add new tables, add `lastFullRunAt` to monitoredDomains
- `apps/web/src/inngest/functions/monitor-domains.ts`: cadence dispatch (diff vs full), scope-aware auditor invocation
- `apps/web/src/app/dashboard/page.tsx`: replace admin table with portfolio strip + entry points
- `apps/web/src/app/dashboard/domain-row-actions.tsx`: move pause/resume/delete into per-domain detail view (keep component)
- `apps/web/src/app/pricing/page.tsx`: copy edits per spec §11
- `apps/web/src/app/layout.tsx`: expand nav Dashboard pill to include /queue and /integrations when signed in
- `packages/cli/src/cli.ts`: register `upload` subcommand
- `packages/core/src/auditor.ts`: read scope map, skip corpus rules when `state.since` is set
- `packages/core/src/index.ts`: export scope map

---

## Phase A: Core engine: rule scope annotation

### Task 1: Declarative scope map for rules

**Files:**
- Create: `packages/core/src/rules/scope.ts`
- Modify: `packages/core/src/auditor.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/rule-scope.test.ts`

Rules are either **page-scoped** (run on a single page's parsed content) or **corpus-scoped** (need the full set, e.g. SimHash clustering, cannibalization). Daily diff-audits must skip corpus rules because the corpus isn't complete.

- [ ] **Step 1: Create the scope map**

Create `packages/core/src/rules/scope.ts`:

```ts
/**
 * Declarative scope for each rule ID.
 * - "page": output depends only on a single parsed page.
 * - "corpus": output requires the full set of pages (clustering, cross-page comparisons).
 *
 * Diff-audit dispatch reads this map and skips corpus rules when `state.since` is set.
 */
export type RuleScope = "page" | "corpus";

export const RULE_SCOPE: Record<string, RuleScope> = {
  // spam
  "spam/near-duplicate": "corpus",
  "spam/entity-swap": "corpus",
  "spam/thin-content": "page",
  "spam/boilerplate-ratio": "corpus",
  "spam/template-diversity": "corpus",
  "spam/publication-velocity": "corpus",
  "spam/doorway-pattern": "corpus",
  "spam/template-coverage": "corpus",

  // content
  "content/unique-value": "corpus",
  "content/heading-uniqueness": "corpus",
  "content/meta-uniqueness": "corpus",
  "content/missing-author": "page",
  "content/eeat-signals": "page",

  // links (all need the global link graph)
  "links/orphan-pages": "corpus",
  "links/dead-ends": "corpus",
  "links/cluster-connectivity": "corpus",
  "links/hub-pages": "corpus",
  "links/link-depth": "corpus",
  "links/unreachable-from-root": "corpus",
  "links/hub-pages-skipped": "corpus",

  // tech (per-page except sitemap / robots / canonical-consistency which need knownUrls)
  "tech/canonical-consistency": "corpus",
  "tech/canonical-noindex-conflict": "page",
  "tech/robots-noindex-conflict": "corpus",
  "tech/sitemap-completeness": "corpus",
  "tech/redirect-chain": "page",
  "tech/soft-404": "page",
  "tech/og-completeness": "page",
  "tech/hreflang-consistency": "corpus",
  "tech/robots-compliance": "corpus",
  "tech/robots-sitemap-presence": "corpus",

  // schema (all per-page)
  "schema/json-ld-valid": "page",
  "schema/required-fields": "page",
  "schema/consistency": "corpus",

  // cannibal (cross-page by definition)
  "cannibal/title-overlap": "corpus",
  "cannibal/keyword-collision": "corpus",
  "cannibal/url-pattern": "corpus",

  // data binding (needs a record set, but per-page lookups, treat as page)
  "data/missing-binding": "page",
  "data/identical-across-pages": "corpus",

  // audit-internal
  "audit/duplicate-url": "corpus",
};

/** Returns false when the rule is corpus-scoped and the run is a diff-audit. */
export function isRuleAllowedInDiff(ruleId: string): boolean {
  return (RULE_SCOPE[ruleId] ?? "corpus") === "page";
}
```

- [ ] **Step 2: Export from index**

In `packages/core/src/index.ts`, add:

```ts
export { RULE_SCOPE, isRuleAllowedInDiff } from "./rules/scope.js";
export type { RuleScope } from "./rules/scope.js";
```

- [ ] **Step 3: Thread "diff mode" through the auditor**

In `packages/core/src/auditor.ts`, add a new `options.mode` field surface. Add to `AuditOptions` in `types.ts`:

```ts
/** When "diff", corpus-scoped rules are skipped (used by hosted diff-audits). Default: "full". */
mode?: "full" | "diff";
```

In the `runRulesOnPages` dispatcher in `auditor.ts`, wrap each rule call with a scope check. Replace each `isEnabled("spam/near-duplicate")` call with a compound check:

```ts
const modeOk = (ruleId: string) => options?.mode !== "diff" || isRuleAllowedInDiff(ruleId);
// ...
if (isEnabled("spam/near-duplicate") && modeOk("spam/near-duplicate")) {
  findings.push(...tag(nearDuplicate.findings));
}
```

Pass `options` into `runRulesOnPages` (add it to the function signature). Update the existing call site at the bottom of `auditSource` to pass `options`.

- [ ] **Step 4: Write the scope test**

Create `packages/core/tests/rule-scope.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { RULE_SCOPE, isRuleAllowedInDiff } from "../src/rules/scope.js";

describe("rule scope map", () => {
  it("has a scope entry for every exported rule id", () => {
    // Representative sample, drift detector.
    const critical = [
      "spam/near-duplicate",
      "spam/thin-content",
      "content/eeat-signals",
      "links/orphan-pages",
      "tech/redirect-chain",
      "schema/json-ld-valid",
      "cannibal/title-overlap",
    ];
    for (const id of critical) {
      expect(RULE_SCOPE[id]).toBeDefined();
    }
  });

  it("allows page rules in diff mode", () => {
    expect(isRuleAllowedInDiff("spam/thin-content")).toBe(true);
    expect(isRuleAllowedInDiff("content/eeat-signals")).toBe(true);
  });

  it("blocks corpus rules in diff mode", () => {
    expect(isRuleAllowedInDiff("spam/near-duplicate")).toBe(false);
    expect(isRuleAllowedInDiff("cannibal/title-overlap")).toBe(false);
  });

  it("defaults unknown ids to corpus (safer, blocks in diff)", () => {
    expect(isRuleAllowedInDiff("future/unknown-rule")).toBe(false);
  });
});
```

- [ ] **Step 5: Run and commit**

```bash
cd packages/core && npm test -- rule-scope && cd ../..
git add packages/core/src/rules/scope.ts packages/core/src/index.ts packages/core/src/auditor.ts packages/core/src/types.ts packages/core/tests/rule-scope.test.ts
git commit -m "feat(core): add rule scope annotation + diff-mode gating"
```

---

## Phase B: Schema migrations

### Task 2: Extend schema.ts with new tables and lastFullRunAt

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Create: `apps/web/src/db/migrations/0003_findings_and_integrations.sql`

- [ ] **Step 1: Add `lastFullRunAt` to monitoredDomains**

In `apps/web/src/db/schema.ts`, add to the `monitoredDomains` definition after `lastRunAt`:

```ts
  lastFullRunAt: timestamp("last_full_run_at", { withTimezone: true }),
```

- [ ] **Step 2: Add `findingsState`, `integrations`, `gscPageMetrics`, `uploadTokens`, `alertsDedup`**

Append to `apps/web/src/db/schema.ts` (after `monitoringAlerts`):

```ts
export const findingsState = pgTable("findings_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id").notNull().references(() => monitoredDomains.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").notNull(),
  templateSignature: text("template_signature").notNull(),
  severityLatest: text("severity_latest").$type<"info" | "warning" | "error" | "critical">().notNull(),
  affectedPageCount: integer("affected_page_count").notNull().default(0),
  rankScore: numeric("rank_score", { precision: 12, scale: 4 }).notNull().default("0"),
  status: text("status").$type<"open" | "snoozed" | "dismissed">().notNull().default("open"),
  snoozeUntil: timestamp("snooze_until", { withTimezone: true }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  ruleMessageLatest: text("rule_message_latest").notNull(),
  representativeUrl: text("representative_url"),
}, (t) => ({
  key: uniqueIndex("findings_state_key_uniq").on(t.domainId, t.ruleId, t.templateSignature),
  queueIdx: index("findings_state_queue_idx").on(t.domainId, t.status, t.rankScore),
}));

export const integrations = pgTable("integration", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"gsc" | "github" | "webflow" | "wordpress">().notNull(),
  encryptedTokens: text("encrypted_tokens"),
  scope: text("scope"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userKindUniq: uniqueIndex("integration_user_kind_uniq").on(t.userId, t.kind),
}));

export const gscPageMetrics = pgTable("gsc_page_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id").notNull().references(() => monitoredDomains.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  monthBucket: text("month_bucket").notNull(), // "YYYY-MM"
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  positionAvg: numeric("position_avg", { precision: 6, scale: 2 }),
  ctrAvg: numeric("ctr_avg", { precision: 6, scale: 4 }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  key: uniqueIndex("gsc_metrics_key_uniq").on(t.domainId, t.url, t.monthBucket),
  domainIdx: index("gsc_metrics_domain_idx").on(t.domainId),
}));

export const uploadTokens = pgTable("upload_token", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  tokenHash: text("token_hash").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => ({
  userIdx: index("upload_token_user_idx").on(t.userId),
  tokenHashUniq: uniqueIndex("upload_token_hash_uniq").on(t.tokenHash),
}));

export const alertsDedup = pgTable("alerts_dedup", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id").notNull().references(() => monitoredDomains.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").notNull(),
  templateSignature: text("template_signature").notNull(),
  isoWeek: text("iso_week").notNull(), // "2026-W17"
  deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  key: uniqueIndex("alerts_dedup_key_uniq").on(t.domainId, t.ruleId, t.templateSignature, t.isoWeek),
}));
```

- [ ] **Step 3: Generate the SQL migration**

```bash
cd apps/web && npx drizzle-kit generate && cd ../..
```

This writes `apps/web/src/db/migrations/0003_<generated>.sql`. Rename the output to `0003_findings_and_integrations.sql` (keep the generated SQL as-is; rename the file and update `meta/_journal.json` tag accordingly).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/db/schema.ts apps/web/src/db/migrations/0003_findings_and_integrations.sql apps/web/src/db/migrations/meta/0003_snapshot.json apps/web/src/db/migrations/meta/_journal.json
git commit -m "feat(db): schema for findings_state, integrations, gsc metrics, upload tokens, alerts dedup"
```

---

## Phase C: Findings-state ingest

### Task 3: Template signature computation

**Files:**
- Create: `apps/web/src/lib/findings-state.ts` (partial: signature helper only)
- Test: `apps/web/tests/unit/template-signature.test.ts`

`template_signature` is the key that makes suppressions stable across the churn of individual URLs. We reuse the OSS engine's `inferUrlTemplate` but fall back to `__global__` for findings without a URL (site-wide rules like `tech/robots-compliance`).

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/template-signature.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { templateSignatureFor } from "@/lib/findings-state";
import type { RuleResult } from "@pseolint/core";

const mk = (p: Partial<RuleResult>): RuleResult => ({
  ruleId: "spam/thin-content",
  severity: "warning",
  message: "",
  ...p,
});

describe("templateSignatureFor", () => {
  it("returns inferred URL template when pageUrl is present", () => {
    expect(templateSignatureFor(mk({ pageUrl: "https://ex.com/state/ca/city/sf" })))
      .toMatch(/\{[^}]+\}/);
  });

  it("returns __global__ when no pageUrl", () => {
    expect(templateSignatureFor(mk({ pageUrl: undefined }))).toBe("__global__");
  });

  it("stable across two URLs in the same template", () => {
    const a = templateSignatureFor(mk({ pageUrl: "https://ex.com/state/ca/city/sf" }));
    const b = templateSignatureFor(mk({ pageUrl: "https://ex.com/state/ny/city/nyc" }));
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run: expect MODULE NOT FOUND**

```bash
cd apps/web && npm test -- template-signature && cd ../..
```

- [ ] **Step 3: Create `findings-state.ts` with the helper**

Create `apps/web/src/lib/findings-state.ts`:

```ts
import { inferUrlTemplate } from "@pseolint/core";
import type { RuleResult } from "@pseolint/core";

/** Stable key for domain-scoped suppressions. */
export function templateSignatureFor(finding: RuleResult): string {
  if (!finding.pageUrl) return "__global__";
  try {
    return inferUrlTemplate(finding.pageUrl);
  } catch {
    return finding.pageUrl;
  }
}
```

- [ ] **Step 4: Run: expect PASS**

```bash
cd apps/web && npm test -- template-signature && cd ../..
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/findings-state.ts apps/web/tests/unit/template-signature.test.ts
git commit -m "feat(web): template signature helper for findings state"
```

### Task 4: Merge function: upsert findings into state

**Files:**
- Modify: `apps/web/src/lib/findings-state.ts`
- Test: `apps/web/tests/integration/findings-state.test.ts`

- [ ] **Step 1: Write the integration test**

Create `apps/web/tests/integration/findings-state.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { findingsState, monitoredDomains, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mergeFindings } from "@/lib/findings-state";
import type { RuleResult } from "@pseolint/core";

describe("mergeFindings", () => {
  let userId: string;
  let domainId: string;

  beforeEach(async () => {
    userId = `u_${Math.random().toString(36).slice(2, 10)}`;
    await db.insert(users).values({ id: userId, email: `${userId}@example.test`, emailVerified: false });
    const [d] = await db.insert(monitoredDomains).values({
      userId, sourceUrl: "https://ex.com", host: "ex.com",
    }).returning();
    domainId = d.id;
  });

  it("inserts new finding with first/last seen equal", async () => {
    const findings: RuleResult[] = [
      { ruleId: "spam/thin-content", severity: "warning", message: "thin", pageUrl: "https://ex.com/p/1" },
    ];
    await mergeFindings(domainId, findings, 1000);
    const rows = await db.select().from(findingsState).where(eq(findingsState.domainId, domainId));
    expect(rows).toHaveLength(1);
    expect(rows[0].firstSeenAt.getTime()).toBe(rows[0].lastSeenAt.getTime());
  });

  it("updates last_seen and page count on recurrence", async () => {
    const f: RuleResult = { ruleId: "spam/thin-content", severity: "warning", message: "thin", pageUrl: "https://ex.com/p/1" };
    await mergeFindings(domainId, [f], 1000);
    const t1 = (await db.select().from(findingsState).where(eq(findingsState.domainId, domainId)))[0];
    await new Promise((r) => setTimeout(r, 5));
    await mergeFindings(domainId, [f, { ...f, pageUrl: "https://ex.com/p/2" }], 1000);
    const t2 = (await db.select().from(findingsState).where(eq(findingsState.domainId, domainId)))[0];
    expect(t2.firstSeenAt.getTime()).toBe(t1.firstSeenAt.getTime());
    expect(t2.lastSeenAt.getTime()).toBeGreaterThan(t1.lastSeenAt.getTime());
  });

  it("does not resurrect dismissed findings", async () => {
    const f: RuleResult = { ruleId: "spam/thin-content", severity: "warning", message: "thin", pageUrl: "https://ex.com/p/1" };
    await mergeFindings(domainId, [f], 1000);
    await db.update(findingsState).set({ status: "dismissed" }).where(eq(findingsState.domainId, domainId));
    await mergeFindings(domainId, [f], 1000);
    const row = (await db.select().from(findingsState).where(eq(findingsState.domainId, domainId)))[0];
    expect(row.status).toBe("dismissed");
  });
});
```

- [ ] **Step 2: Implement `mergeFindings` and `rankScoreFor`**

Append to `apps/web/src/lib/findings-state.ts`:

```ts
import { db } from "@/db";
import { findingsState } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { Severity } from "@pseolint/core";

const SEVERITY_WEIGHT: Record<Severity, number> = {
  info: 1, warning: 4, error: 10, critical: 25,
};

/** GSC-weighted rank if impressions known, else severity×pages fallback. */
export function rankScoreFor(severity: Severity, affectedPages: number, impressions?: number): number {
  const base = SEVERITY_WEIGHT[severity] * Math.max(1, affectedPages);
  if (impressions === undefined) return base;
  return Math.log1p(impressions) * base;
}

/**
 * Merge a new audit's findings into findings_state for a domain.
 *
 * Groups findings by (rule_id, template_signature). For each group: upserts the row,
 * updates last_seen, affected_page_count, severity_latest, rule_message_latest,
 * representative_url, and rank_score (without impressions: GSC join happens in v1.1).
 *
 * Preserves status (does NOT resurrect snoozed or dismissed findings).
 */
export async function mergeFindings(
  domainId: string,
  findings: readonly RuleResult[],
  _domainImpressions?: number,
): Promise<void> {
  const now = new Date();
  type Group = { ruleId: string; sig: string; severity: Severity; count: number; message: string; repUrl?: string };
  const groups = new Map<string, Group>();
  for (const f of findings) {
    const sig = templateSignatureFor(f);
    const key = `${f.ruleId}::${sig}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      // Keep worst severity seen in this run.
      if (SEVERITY_WEIGHT[f.severity] > SEVERITY_WEIGHT[g.severity]) g.severity = f.severity;
    } else {
      groups.set(key, {
        ruleId: f.ruleId, sig, severity: f.severity, count: 1,
        message: f.message, repUrl: f.pageUrl,
      });
    }
  }

  for (const g of groups.values()) {
    const rank = rankScoreFor(g.severity, g.count).toFixed(4);
    await db.insert(findingsState).values({
      domainId, ruleId: g.ruleId, templateSignature: g.sig,
      severityLatest: g.severity,
      affectedPageCount: g.count,
      rankScore: rank,
      ruleMessageLatest: g.message,
      representativeUrl: g.repUrl,
      firstSeenAt: now,
      lastSeenAt: now,
    }).onConflictDoUpdate({
      target: [findingsState.domainId, findingsState.ruleId, findingsState.templateSignature],
      set: {
        severityLatest: g.severity,
        affectedPageCount: g.count,
        rankScore: rank,
        ruleMessageLatest: g.message,
        representativeUrl: g.repUrl,
        lastSeenAt: now,
        // status intentionally NOT touched, preserves snoozed/dismissed.
      },
    });
  }
}
```

- [ ] **Step 3: Run and expect all three tests PASS**

```bash
cd apps/web && npm test -- findings-state && cd ../..
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/findings-state.ts apps/web/tests/integration/findings-state.test.ts
git commit -m "feat(web): findings_state upsert + rank scoring"
```

---

## Phase D: Scheduler extension

### Task 5: Diff vs full cadence dispatch

**Files:**
- Modify: `apps/web/src/inngest/functions/monitor-domains.ts`
- Modify: `apps/web/src/inngest/functions/run-audit.ts` (confirm AuditOptions passthrough for `mode`)

- [ ] **Step 1: Check `run-audit.ts` signatures**

Read `apps/web/src/inngest/functions/run-audit.ts`. Confirm that `executeAuditInProcess` accepts an options object that can carry `mode` and `state`. If not, add them to the signature and forward to `auditSource`.

- [ ] **Step 2: Modify monitorDomains to choose diff vs full**

In `apps/web/src/inngest/functions/monitor-domains.ts`, replace the `runOneMonitor(d.id)` invocation path with a cadence-aware wrapper. At the top of `runOneMonitor`:

```ts
const FULL_REAUDIT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

async function runOneMonitor(monitoredDomainId: string) {
  const [d] = await db.select().from(monitoredDomains).where(eq(monitoredDomains.id, monitoredDomainId)).limit(1);
  if (!d) return;

  const now = new Date();
  const lastFull = d.lastFullRunAt ? d.lastFullRunAt.getTime() : 0;
  const isFullRun = now.getTime() - lastFull >= FULL_REAUDIT_INTERVAL_MS;
  const mode: "full" | "diff" = isFullRun ? "full" : "diff";
  auditLog("monitor.domain.dispatch", { domainId: d.id, mode });

  // ... existing quota/plan code unchanged ...

  // Where executeAuditInProcess is called, pass:
  const summary = await executeAuditInProcess(d.sourceUrl, {
    mode,
    ...(mode === "diff" && { state: { since: true, path: `.pseolint/state-${d.id}.json` } }),
    // ... existing options
  });

  // After successful audit + merging findings state:
  await db.update(monitoredDomains).set({
    lastRunAt: now,
    ...(isFullRun && { lastFullRunAt: now }),
    nextRunAt: withJitter(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
  }).where(eq(monitoredDomains.id, d.id));
}
```

(Keep the existing nextRunAt jitter, rate-limit, and per-host throttle logic untouched.)

- [ ] **Step 3: Call mergeFindings post-audit**

In the same function, after the audit completes, invoke `mergeFindings` with `summary.findings`:

```ts
import { mergeFindings } from "@/lib/findings-state";
// ...
await mergeFindings(d.id, summary.findings);
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/inngest/functions/monitor-domains.ts apps/web/src/inngest/functions/run-audit.ts
git commit -m "feat(scheduler): diff/full cadence dispatch + findings_state merge"
```

---

## Phase E: CLI upload + ingestion endpoint

### Task 6: Upload token generation + verification helpers

**Files:**
- Create: `apps/web/src/lib/upload-token.ts`
- Test: `apps/web/tests/unit/upload-token.test.ts`

- [ ] **Step 1: Write the test**

```ts
// apps/web/tests/unit/upload-token.test.ts
import { describe, it, expect } from "vitest";
import { createUploadToken, verifyUploadToken } from "@/lib/upload-token";

describe("upload token", () => {
  it("creates a token + hash pair where verify matches", async () => {
    const { token, hash } = await createUploadToken();
    expect(token).toMatch(/^pslt_[A-Za-z0-9_-]{40,}$/);
    expect(await verifyUploadToken(token, hash)).toBe(true);
  });

  it("verify rejects tampered tokens", async () => {
    const { token, hash } = await createUploadToken();
    expect(await verifyUploadToken(token + "x", hash)).toBe(false);
  });

  it("verify rejects malformed tokens", async () => {
    expect(await verifyUploadToken("not-a-token", "irrelevant")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// apps/web/src/lib/upload-token.ts
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
```

- [ ] **Step 3: Run tests + commit**

```bash
cd apps/web && npm test -- upload-token && cd ../..
git add apps/web/src/lib/upload-token.ts apps/web/tests/unit/upload-token.test.ts
git commit -m "feat(web): upload token generation + SHA-256 verify"
```

### Task 7: POST /api/audits/upload endpoint

**Files:**
- Create: `apps/web/src/app/api/audits/upload/route.ts`
- Test: `apps/web/tests/integration/upload-endpoint.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/integration/upload-endpoint.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { POST } from "@/app/api/audits/upload/route";
import { db } from "@/db";
import { uploadTokens, monitoredDomains, users, findingsState } from "@/db/schema";
import { createUploadToken } from "@/lib/upload-token";
import { eq } from "drizzle-orm";

describe("POST /api/audits/upload", () => {
  let token: string;
  let userId: string;
  let domainId: string;

  beforeAll(async () => {
    userId = `u_${Math.random().toString(36).slice(2, 10)}`;
    await db.insert(users).values({ id: userId, email: `${userId}@ex.test`, emailVerified: false });
    const [d] = await db.insert(monitoredDomains).values({
      userId, sourceUrl: "https://ex.com", host: "ex.com",
    }).returning();
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
        score: 72, categoryScores: {}, pageCount: 10,
        findings: [
          { ruleId: "spam/thin-content", severity: "warning", message: "thin", pageUrl: "https://ex.com/p/1" },
        ],
      },
    });
    const res = await POST(new Request("http://localhost/api/audits/upload", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body,
    }));
    expect(res.status).toBe(200);
    const rows = await db.select().from(findingsState).where(eq(findingsState.domainId, domainId));
    expect(rows.some((r) => r.ruleId === "spam/thin-content")).toBe(true);
  });
});
```

- [ ] **Step 2: Implement the route**

```ts
// apps/web/src/app/api/audits/upload/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { uploadTokens, monitoredDomains } from "@/db/schema";
import { verifyUploadToken } from "@/lib/upload-token";
import { mergeFindings } from "@/lib/findings-state";
import { and, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { RuleResult } from "@pseolint/core";

export const runtime = "nodejs";

const BodySchema = z.object({
  domainId: z.string().uuid(),
  summary: z.object({
    score: z.number(),
    pageCount: z.number(),
    findings: z.array(z.object({
      ruleId: z.string(),
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      pageUrl: z.string().optional(),
      relatedUrls: z.array(z.string()).optional(),
    })).max(10_000),
  }),
});

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const [row] = await db.select()
    .from(uploadTokens)
    .where(and(eq(uploadTokens.tokenHash, tokenHash), isNull(uploadTokens.revokedAt)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await verifyUploadToken(token, row.tokenHash))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "bad_request", detail: (e as Error).message }, { status: 400 });
  }

  // Confirm domain belongs to this user
  const [d] = await db.select().from(monitoredDomains)
    .where(and(eq(monitoredDomains.id, parsed.domainId), eq(monitoredDomains.userId, row.userId)))
    .limit(1);
  if (!d) return NextResponse.json({ error: "domain_not_found" }, { status: 404 });

  await db.update(uploadTokens).set({ lastUsedAt: new Date() }).where(eq(uploadTokens.id, row.id));
  await mergeFindings(parsed.domainId, parsed.summary.findings as RuleResult[]);

  return NextResponse.json({ ok: true, ingested: parsed.summary.findings.length });
}
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && npm test -- upload-endpoint && cd ../..
git add apps/web/src/app/api/audits/upload apps/web/tests/integration/upload-endpoint.test.ts
git commit -m "feat(web): POST /api/audits/upload, CLI ingestion endpoint"
```

### Task 8: `pseolint upload` CLI subcommand

**Files:**
- Create: `packages/cli/src/commands/upload.ts`
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1: Implement the subcommand**

```ts
// packages/cli/src/commands/upload.ts
import { readFile } from "node:fs/promises";

export async function uploadCommand(args: {
  reportPath: string;
  token: string;
  domainId: string;
  endpoint?: string;
}): Promise<void> {
  const endpoint = args.endpoint ?? process.env.PSEOLINT_ENDPOINT ?? "https://pseolint.dev";
  const url = `${endpoint.replace(/\/$/, "")}/api/audits/upload`;
  const raw = await readFile(args.reportPath, "utf8");
  let summary: unknown;
  try { summary = JSON.parse(raw); } catch { throw new Error(`Invalid JSON: ${args.reportPath}`); }

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${args.token}` },
    body: JSON.stringify({ domainId: args.domainId, summary }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }
  const j = await res.json();
  console.log(`uploaded: ${j.ingested} findings → ${args.domainId}`);
}
```

- [ ] **Step 2: Register in cli.ts**

In `packages/cli/src/cli.ts`, add under the existing command dispatcher:

```ts
if (command === "upload") {
  const reportPath = positional[1];
  const token = options["token"] ?? process.env.PSEOLINT_TOKEN;
  const domainId = options["domain-id"] ?? process.env.PSEOLINT_DOMAIN_ID;
  if (!reportPath) { console.error("usage: pseolint upload <report.json> --token <t> --domain-id <id>"); process.exit(2); }
  if (!token || !domainId) { console.error("missing --token or --domain-id (or PSEOLINT_TOKEN / PSEOLINT_DOMAIN_ID)"); process.exit(2); }
  const { uploadCommand } = await import("./commands/upload.js");
  await uploadCommand({ reportPath, token, domainId, endpoint: options["endpoint"] });
  process.exit(0);
}
```

(If the CLI uses a different parsing convention, inspect the existing dispatch and mirror it.)

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/upload.ts packages/cli/src/cli.ts
git commit -m "feat(cli): pseolint upload, POST audit JSON to Pro"
```

---

## Phase F: CMS-aware message layer

### Task 9: CMS detection + message rewrite

**Files:**
- Create: `apps/web/src/lib/cms-messages.ts`
- Test: `apps/web/tests/unit/cms-messages.test.ts`

- [ ] **Step 1: Write the test**

```ts
// apps/web/tests/unit/cms-messages.test.ts
import { describe, it, expect } from "vitest";
import { rewriteMessageForCms, detectCms } from "@/lib/cms-messages";

describe("detectCms", () => {
  it("detects Webflow from /collections/", () => {
    expect(detectCms("https://ex.com/collections/hotels/paris")).toBe("webflow");
  });
  it("detects WordPress from /?p=", () => {
    expect(detectCms("https://ex.com/?p=123")).toBe("wordpress");
  });
  it("detects WordPress from /category/", () => {
    expect(detectCms("https://ex.com/category/news")).toBe("wordpress");
  });
  it("uses HTML hint when URL is ambiguous", () => {
    expect(detectCms("https://ex.com/page/1", "<link href='/wp-content/themes/...'>")).toBe("wordpress");
  });
  it("returns null on no match", () => {
    expect(detectCms("https://ex.com/about")).toBeNull();
  });
});

describe("rewriteMessageForCms", () => {
  it("prefixes Webflow collection context", () => {
    const out = rewriteMessageForCms("thin content detected", "spam/thin-content", "webflow");
    expect(out).toMatch(/Collection/i);
  });
  it("prefixes WordPress context", () => {
    const out = rewriteMessageForCms("thin content detected", "spam/thin-content", "wordpress");
    expect(out).toMatch(/Post Type|WordPress/i);
  });
  it("returns original on null cms", () => {
    expect(rewriteMessageForCms("original", "spam/thin-content", null)).toBe("original");
  });
});
```

- [ ] **Step 2: Implement**

```ts
// apps/web/src/lib/cms-messages.ts
export type CmsKind = "webflow" | "wordpress";

const WEBFLOW_URL = [/\/collections\//i, /\?collection=/i];
const WORDPRESS_URL = [/\/category\//i, /\/tag\//i, /\/\?p=/i];
const WEBFLOW_HTML = [/webflow\.com\/api/i, /data-wf-/i];
const WORDPRESS_HTML = [/wp-content/i, /wp-includes/i];

export function detectCms(pageUrl: string, html?: string): CmsKind | null {
  const webUrl = WEBFLOW_URL.some((r) => r.test(pageUrl));
  const wpUrl = WORDPRESS_URL.some((r) => r.test(pageUrl));
  if (webUrl && !wpUrl) return "webflow";
  if (wpUrl && !webUrl) return "wordpress";
  if (webUrl && wpUrl) {
    // collision, disambiguate via HTML hint
    if (html && WORDPRESS_HTML.some((r) => r.test(html))) return "wordpress";
    if (html && WEBFLOW_HTML.some((r) => r.test(html))) return "webflow";
    return null;
  }
  return null;
}

export function rewriteMessageForCms(original: string, _ruleId: string, cms: CmsKind | null): string {
  if (!cms) return original;
  if (cms === "webflow") return `In your Webflow Collection: ${original}`;
  if (cms === "wordpress") return `In your WordPress Post Type / Taxonomy: ${original}`;
  return original;
}
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && npm test -- cms-messages && cd ../..
git add apps/web/src/lib/cms-messages.ts apps/web/tests/unit/cms-messages.test.ts
git commit -m "feat(web): CMS-aware finding message rewrite (Webflow + WordPress)"
```

### Task 10: Wire CMS rewrite into mergeFindings

**Files:**
- Modify: `apps/web/src/lib/findings-state.ts`

- [ ] **Step 1: Apply the rewrite before storing `ruleMessageLatest`**

In `mergeFindings`, in the group-build loop, wrap the message:

```ts
import { detectCms, rewriteMessageForCms } from "@/lib/cms-messages";
// ...
const cms = f.pageUrl ? detectCms(f.pageUrl) : null;
const rewritten = rewriteMessageForCms(f.message, f.ruleId, cms);
// use `rewritten` when setting g.message
```

- [ ] **Step 2: Add a regression test**

Append to `apps/web/tests/integration/findings-state.test.ts`:

```ts
it("stores CMS-aware rewritten message", async () => {
  await mergeFindings(domainId, [
    { ruleId: "spam/thin-content", severity: "warning", message: "thin", pageUrl: "https://ex.com/collections/p/a" },
  ], 1000);
  const [row] = await db.select().from(findingsState).where(eq(findingsState.domainId, domainId));
  expect(row.ruleMessageLatest).toMatch(/Webflow Collection/i);
});
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && npm test -- findings-state && cd ../..
git add apps/web/src/lib/findings-state.ts apps/web/tests/integration/findings-state.test.ts
git commit -m "feat(web): apply CMS-aware rewrite when merging findings"
```

---

## Phase G: Alert gating + weekly digest

### Task 11: Alert gate evaluator

**Files:**
- Create: `apps/web/src/lib/alert-gate.ts`
- Test: `apps/web/tests/integration/alert-gate.test.ts`

- [ ] **Step 1: Write the test**

```ts
// apps/web/tests/integration/alert-gate.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { findingsState, monitoredDomains, users, alertsDedup } from "@/db/schema";
import { evaluateAlertGate } from "@/lib/alert-gate";
import { eq } from "drizzle-orm";

describe("evaluateAlertGate", () => {
  let userId: string;
  let domainId: string;

  beforeEach(async () => {
    userId = `u_${Math.random().toString(36).slice(2, 10)}`;
    await db.insert(users).values({ id: userId, email: `${userId}@ex.test`, emailVerified: false });
    const [d] = await db.insert(monitoredDomains).values({ userId, sourceUrl: "https://ex.com", host: "ex.com" }).returning();
    domainId = d.id;
  });

  it("triggers on score delta >= 10", async () => {
    const out = await evaluateAlertGate({ domainId, prevScore: 80, currentScore: 65, newCombinations: [] });
    expect(out.shouldAlert).toBe(true);
    expect(out.reasons).toContain("score_delta");
  });

  it("triggers on new critical/error combination not seen before", async () => {
    const out = await evaluateAlertGate({
      domainId, prevScore: 80, currentScore: 79,
      newCombinations: [{ ruleId: "spam/near-duplicate", templateSignature: "__global__", severity: "error" }],
    });
    expect(out.shouldAlert).toBe(true);
    expect(out.reasons).toContain("new_error");
  });

  it("does not trigger below thresholds", async () => {
    const out = await evaluateAlertGate({
      domainId, prevScore: 80, currentScore: 79,
      newCombinations: [{ ruleId: "content/missing-author", templateSignature: "sig", severity: "warning" }],
    });
    expect(out.shouldAlert).toBe(false);
  });

  it("dedups within the same ISO week", async () => {
    const combo = { ruleId: "spam/near-duplicate", templateSignature: "__global__", severity: "error" as const };
    const first = await evaluateAlertGate({ domainId, prevScore: 80, currentScore: 79, newCombinations: [combo] });
    expect(first.shouldAlert).toBe(true);
    await db.insert(alertsDedup).values({ domainId, ruleId: combo.ruleId, templateSignature: combo.templateSignature, isoWeek: isoWeekOf(new Date()) });
    const second = await evaluateAlertGate({ domainId, prevScore: 80, currentScore: 79, newCombinations: [combo] });
    expect(second.shouldAlert).toBe(false);
  });
});

function isoWeekOf(d: Date): string {
  // Inline duplicate for test clarity, implementation in alert-gate.ts
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Implement**

```ts
// apps/web/src/lib/alert-gate.ts
import { db } from "@/db";
import { alertsDedup } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { Severity } from "@pseolint/core";

export function isoWeekOf(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface AlertEvalInput {
  domainId: string;
  prevScore: number | null;
  currentScore: number;
  newCombinations: Array<{ ruleId: string; templateSignature: string; severity: Severity }>;
}

export interface AlertEvalResult {
  shouldAlert: boolean;
  reasons: Array<"score_delta" | "new_error">;
  firingCombinations: Array<{ ruleId: string; templateSignature: string }>;
}

const SCORE_DELTA_THRESHOLD = 10;

export async function evaluateAlertGate(input: AlertEvalInput): Promise<AlertEvalResult> {
  const reasons: AlertEvalResult["reasons"] = [];
  const firing: AlertEvalResult["firingCombinations"] = [];

  if (input.prevScore !== null && Math.abs(input.currentScore - input.prevScore) >= SCORE_DELTA_THRESHOLD) {
    reasons.push("score_delta");
  }

  const critOrError = input.newCombinations.filter((c) => c.severity === "error" || c.severity === "critical");
  if (critOrError.length > 0) {
    const week = isoWeekOf(new Date());
    const existing = await db.select().from(alertsDedup).where(
      and(
        eq(alertsDedup.domainId, input.domainId),
        eq(alertsDedup.isoWeek, week),
        inArray(alertsDedup.ruleId, critOrError.map((c) => c.ruleId)),
      ),
    );
    const dedupSet = new Set(existing.map((r) => `${r.ruleId}::${r.templateSignature}`));
    for (const c of critOrError) {
      if (!dedupSet.has(`${c.ruleId}::${c.templateSignature}`)) {
        firing.push({ ruleId: c.ruleId, templateSignature: c.templateSignature });
      }
    }
    if (firing.length > 0) reasons.push("new_error");
  }

  return { shouldAlert: reasons.length > 0, reasons, firingCombinations: firing };
}
```

- [ ] **Step 3: Wire into runOneMonitor**

In `apps/web/src/inngest/functions/monitor-domains.ts`, after `mergeFindings`, compute `newCombinations` by reading findings_state for rows whose `firstSeenAt === lastSeenAt` (new this run) and `status === "open"`, then call `evaluateAlertGate`. On `shouldAlert`, write one row per firing combination into `alertsDedup` and enqueue the existing alert-email flow.

```ts
import { evaluateAlertGate, isoWeekOf } from "@/lib/alert-gate";
import { alertsDedup, findingsState } from "@/db/schema";
// ...
const newOnes = await db.select().from(findingsState).where(and(
  eq(findingsState.domainId, d.id),
  eq(findingsState.status, "open"),
  eq(findingsState.firstSeenAt, findingsState.lastSeenAt),
));
const gate = await evaluateAlertGate({
  domainId: d.id,
  prevScore: d.lastScore ?? null,
  currentScore: summary.score,
  newCombinations: newOnes.map((r) => ({ ruleId: r.ruleId, templateSignature: r.templateSignature, severity: r.severityLatest })),
});
if (gate.shouldAlert) {
  const week = isoWeekOf(new Date());
  for (const f of gate.firingCombinations) {
    await db.insert(alertsDedup).values({ domainId: d.id, ruleId: f.ruleId, templateSignature: f.templateSignature, isoWeek: week }).onConflictDoNothing();
  }
  // ... existing sendMonitoringAlertEmail call (keep as-is, pass gate.reasons)
}
```

- [ ] **Step 4: Run + commit**

```bash
cd apps/web && npm test -- alert-gate && cd ../..
git add apps/web/src/lib/alert-gate.ts apps/web/src/inngest/functions/monitor-domains.ts apps/web/tests/integration/alert-gate.test.ts
git commit -m "feat(web): alert gate, score delta + new error combos, per-week dedup"
```

### Task 12: Weekly digest email + cron

**Files:**
- Create: `apps/web/src/emails/WeeklyDigestEmail.tsx`
- Create: `apps/web/src/lib/digest-email.ts`
- Create: `apps/web/src/inngest/functions/weekly-digest.ts`

- [ ] **Step 1: Email template**

```tsx
// apps/web/src/emails/WeeklyDigestEmail.tsx
import { Html, Head, Body, Container, Heading, Text, Link, Hr } from "@react-email/components";

export interface DigestItem {
  domainHost: string;
  ruleId: string;
  message: string;
  affectedPages: number;
  detailUrl: string;
}

export default function WeeklyDigestEmail({ items, appUrl }: { items: DigestItem[]; appUrl: string }) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <Container>
          <Heading as="h2">Top 3 fixes this week</Heading>
          {items.map((it, i) => (
            <div key={i} style={{ marginTop: 16 }}>
              <Text style={{ margin: 0, fontWeight: 600 }}>{it.domainHost} · {it.ruleId}</Text>
              <Text style={{ margin: "4px 0", color: "#555" }}>{it.message}</Text>
              <Text style={{ margin: "4px 0", fontSize: 13 }}>Affects {it.affectedPages} pages.</Text>
              <Link href={it.detailUrl}>Open in dashboard</Link>
            </div>
          ))}
          <Hr />
          <Text style={{ fontSize: 12, color: "#888" }}>
            Manage delivery at <Link href={`${appUrl}/dashboard/settings`}>dashboard settings</Link>.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Composer + sender**

```ts
// apps/web/src/lib/digest-email.ts
import { Resend } from "resend";
import { render } from "@react-email/render";
import { db } from "@/db";
import { findingsState, monitoredDomains } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { env } from "@/lib/env";
import WeeklyDigestEmail, { type DigestItem } from "@/emails/WeeklyDigestEmail";

export async function sendWeeklyDigestTo(userId: string, userEmail: string): Promise<void> {
  const domains = await db.select().from(monitoredDomains).where(eq(monitoredDomains.userId, userId));
  if (domains.length === 0) return;
  const items: DigestItem[] = [];
  for (const d of domains) {
    const top = await db.select().from(findingsState)
      .where(and(eq(findingsState.domainId, d.id), eq(findingsState.status, "open")))
      .orderBy(desc(findingsState.rankScore))
      .limit(3);
    for (const f of top) {
      items.push({
        domainHost: d.host, ruleId: f.ruleId,
        message: f.ruleMessageLatest, affectedPages: f.affectedPageCount,
        detailUrl: `${env().BETTER_AUTH_URL}/dashboard/queue?focus=${f.id}`,
      });
    }
  }
  const top3 = items.sort((a, b) => b.affectedPages - a.affectedPages).slice(0, 3);
  if (top3.length === 0) return;
  const html = await render(WeeklyDigestEmail({ items: top3, appUrl: env().BETTER_AUTH_URL }));
  const resend = new Resend(env().RESEND_API_KEY);
  await resend.emails.send({
    from: env().RESEND_FROM, to: userEmail,
    subject: `pseolint, 3 fixes worth making this week`,
    html,
  });
}
```

- [ ] **Step 3: Inngest cron**

```ts
// apps/web/src/inngest/functions/weekly-digest.ts
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { users, userProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sendWeeklyDigestTo } from "@/lib/digest-email";

export const weeklyDigest = inngest.createFunction(
  { id: "weekly-digest", retries: 1 },
  { cron: "0 6 * * 1" }, // Monday 06:00 UTC
  async ({ step }) => {
    const rows = await step.run("fetch-pro-users", async () =>
      db.select({ userId: users.id, email: users.email })
        .from(users)
        .innerJoin(userProfiles, and(eq(userProfiles.userId, users.id), eq(userProfiles.plan, "pro"))),
    );
    for (const r of rows) {
      await step.run(`digest-${r.userId}`, async () => sendWeeklyDigestTo(r.userId, r.email));
    }
    return { sent: rows.length };
  },
);
```

- [ ] **Step 4: Register in Inngest route**

In `apps/web/src/app/api/inngest/route.ts`, add `weeklyDigest` to the exported functions array.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/emails/WeeklyDigestEmail.tsx apps/web/src/lib/digest-email.ts apps/web/src/inngest/functions/weekly-digest.ts apps/web/src/app/api/inngest/route.ts
git commit -m "feat(web): weekly digest email + Monday 06:00 UTC Inngest cron"
```

---

## Phase H: Dashboard surfaces

### Task 13: Portfolio strip replaces admin table

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Modify: `apps/web/src/app/dashboard/domain-row-actions.tsx` (extract to detail view)

- [ ] **Step 1: Replace page.tsx with portfolio strip**

Replace the contents of `apps/web/src/app/dashboard/page.tsx` (keep the auth redirect):

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { findingsState, monitoredDomains, integrations } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { AddDomainForm } from "./add-domain-form";

export const runtime = "nodejs";

export default async function Dashboard() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard");

  const rows = await db.select({
    id: monitoredDomains.id, host: monitoredDomains.host, lastScore: monitoredDomains.lastScore,
    lastRunAt: monitoredDomains.lastRunAt, lastFullRunAt: monitoredDomains.lastFullRunAt,
    openCount: sql<number>`count(${findingsState.id}) filter (where ${findingsState.status} = 'open')::int`.as("open_count"),
  })
    .from(monitoredDomains)
    .leftJoin(findingsState, eq(findingsState.domainId, monitoredDomains.id))
    .where(eq(monitoredDomains.userId, session.user.id))
    .groupBy(monitoredDomains.id);

  const gscConnected = await db.select().from(integrations)
    .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc"))).limit(1);

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl tracking-tight">Your portfolio</h1>
        <Link href="/dashboard/queue" className="text-sm text-primary hover:underline">Fix queue →</Link>
      </div>

      <div className="mt-8 rounded-[22px] border border-border/70 bg-card/60 p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add a domain</h2>
        <AddDomainForm />
      </div>

      <div className="mt-8 overflow-hidden rounded-[22px] border border-border/70 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card/80 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-3 pl-5 pr-4">Domain</th>
              <th className="py-3 pr-4">Score</th>
              <th className="py-3 pr-4">Open findings</th>
              <th className="py-3 pr-4">Last audit</th>
              <th className="py-3 pr-5 text-right">GSC</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">
                No domains yet. Add one above.
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                <td className="py-3.5 pl-5 pr-4">
                  <Link href={`/dashboard/domains/${r.id}`} className="font-medium hover:text-primary hover:underline">
                    {r.host}
                  </Link>
                </td>
                <td className="py-3.5 pr-4 font-mono">{r.lastScore ?? "; "}</td>
                <td className="py-3.5 pr-4">
                  <Link href={`/dashboard/queue?domain=${r.id}`} className="hover:underline">{r.openCount}</Link>
                </td>
                <td className="py-3.5 pr-4 text-muted-foreground">{r.lastRunAt ? r.lastRunAt.toISOString().slice(0, 10) : "; "}</td>
                <td className="py-3.5 pr-5 text-right">{gscConnected.length ? "✓" : <Link href="/dashboard/integrations" className="text-primary hover:underline">Connect</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
```

(Pause/resume/delete actions move to the per-domain page `/dashboard/domains/[id]` which is out of scope for this v1 task, stub the route or keep the existing one if present. Do not delete the `DomainRowActions` component until the detail route replaces it.)

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/dashboard/page.tsx
git commit -m "feat(dashboard): portfolio strip replaces admin table"
```

### Task 14: Fix queue page (paginated, ranked)

**Files:**
- Create: `apps/web/src/app/dashboard/queue/page.tsx`
- Create: `apps/web/src/app/dashboard/queue/actions.ts`

- [ ] **Step 1: Server page**

```tsx
// apps/web/src/app/dashboard/queue/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { findingsState, monitoredDomains } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { snoozeFinding, dismissFinding } from "./actions";

export const runtime = "nodejs";
const PAGE_SIZE = 50;

export default async function FixQueuePage({
  searchParams,
}: { searchParams: Promise<{ page?: string; domain?: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/queue");
  const { page: pageParam, domain } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where = [eq(monitoredDomains.userId, session.user.id), eq(findingsState.status, "open")];
  if (domain) where.push(eq(findingsState.domainId, domain));

  const rows = await db.select({
    id: findingsState.id, ruleId: findingsState.ruleId, message: findingsState.ruleMessageLatest,
    severity: findingsState.severityLatest, affected: findingsState.affectedPageCount,
    rank: findingsState.rankScore, signature: findingsState.templateSignature,
    host: monitoredDomains.host, domainId: monitoredDomains.id, representativeUrl: findingsState.representativeUrl,
  })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...where))
    .orderBy(desc(findingsState.rankScore))
    .limit(PAGE_SIZE)
    .offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...where));

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  // Suppressed-findings counter (visible so dismissals don't silently hide the tool's value, per spec §14).
  const suppressedCountQuery = [eq(monitoredDomains.userId, session.user.id), sql`${findingsState.status} <> 'open'`];
  if (domain) suppressedCountQuery.push(eq(findingsState.domainId, domain));
  const [{ suppressedCount }] = await db.select({ suppressedCount: sql<number>`count(*)::int` })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...suppressedCountQuery));

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl tracking-tight">Fix queue</h1>
        <a href={`/api/dashboard/queue/export.csv${domain ? `?domain=${domain}` : ""}`} className="text-sm text-primary hover:underline">
          Export CSV
        </a>
      </div>

      {suppressedCount > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {suppressedCount} suppressed finding{suppressedCount === 1 ? "" : "s"}, <Link href="/dashboard/queue/suppressed" className="text-primary hover:underline">review</Link>
        </p>
      )}

      <div className="mt-8 overflow-hidden rounded-[22px] border border-border/70 bg-card">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No open findings. Either you&apos;re very clean or nothing has been audited yet.</p>
        ) : rows.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-4 border-b border-border/60 p-5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className={severityTone(r.severity)}>{r.severity}</span>
                <span>·</span>
                <span>{r.ruleId}</span>
                <span>·</span>
                <span>{r.host}</span>
              </div>
              <p className="mt-1 text-sm text-foreground">{r.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Template: <code className="font-mono">{r.signature}</code> · {r.affected} page{r.affected === 1 ? "" : "s"}
                {r.representativeUrl ? <> · <a href={r.representativeUrl} className="hover:underline" target="_blank" rel="noreferrer">example</a></> : null}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <form action={async () => { "use server"; await snoozeFinding(r.id, 90); }}>
                <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">Snooze 90d</button>
              </form>
              <form action={async () => { "use server"; await dismissFinding(r.id); }}>
                <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
              </form>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href={`/dashboard/queue?page=${Math.max(1, page - 1)}${domain ? `&domain=${domain}` : ""}`}
                className={page <= 1 ? "pointer-events-none text-muted-foreground" : "text-primary hover:underline"}>
            ← Previous
          </Link>
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <Link href={`/dashboard/queue?page=${Math.min(totalPages, page + 1)}${domain ? `&domain=${domain}` : ""}`}
                className={page >= totalPages ? "pointer-events-none text-muted-foreground" : "text-primary hover:underline"}>
            Next →
          </Link>
        </div>
      )}
    </main>
  );
}

function severityTone(s: string): string {
  if (s === "critical") return "text-destructive";
  if (s === "error") return "text-destructive";
  if (s === "warning") return "text-warning";
  return "text-muted-foreground";
}
```

- [ ] **Step 2: Snooze/dismiss server actions**

```ts
// apps/web/src/app/dashboard/queue/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { findingsState, monitoredDomains } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getRequiredSession } from "@/lib/session";

async function assertOwns(findingId: string): Promise<void> {
  const session = await getRequiredSession();
  const [row] = await db.select({ uid: monitoredDomains.userId })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(eq(findingsState.id, findingId))
    .limit(1);
  if (!row || row.uid !== session.user.id) throw new Error("not found");
}

export async function snoozeFinding(findingId: string, days: number): Promise<void> {
  await assertOwns(findingId);
  const until = new Date(Date.now() + days * 86_400_000);
  await db.update(findingsState).set({ status: "snoozed", snoozeUntil: until }).where(eq(findingsState.id, findingId));
  revalidatePath("/dashboard/queue");
}

export async function dismissFinding(findingId: string): Promise<void> {
  await assertOwns(findingId);
  await db.update(findingsState).set({ status: "dismissed" }).where(eq(findingsState.id, findingId));
  revalidatePath("/dashboard/queue");
}
```

(If `getRequiredSession` doesn't exist in `@/lib/session`, add it, a thin wrapper that throws when `getOptionalSession` returns null.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/queue apps/web/src/lib/session.ts
git commit -m "feat(dashboard): fix queue page with snooze/dismiss actions"
```

### Task 15: CSV export endpoint

**Files:**
- Create: `apps/web/src/app/api/dashboard/queue/export.csv/route.ts`

- [ ] **Step 1: Implement**

```ts
// apps/web/src/app/api/dashboard/queue/export.csv/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { findingsState, monitoredDomains } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { getOptionalSession } from "@/lib/session";

export const runtime = "nodejs";

function csvEscape(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request): Promise<Response> {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const domain = new URL(req.url).searchParams.get("domain");

  const where = [eq(monitoredDomains.userId, session.user.id), eq(findingsState.status, "open")];
  if (domain) where.push(eq(findingsState.domainId, domain));

  const rows = await db.select({
    host: monitoredDomains.host, ruleId: findingsState.ruleId,
    severity: findingsState.severityLatest, message: findingsState.ruleMessageLatest,
    signature: findingsState.templateSignature, affected: findingsState.affectedPageCount,
    representativeUrl: findingsState.representativeUrl, rank: findingsState.rankScore,
  }).from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...where))
    .orderBy(desc(findingsState.rankScore));

  const lines = [
    ["domain", "rule_id", "severity", "message", "template_signature", "affected_pages", "example_url", "rank_score"].join(","),
    ...rows.map((r) => [r.host, r.ruleId, r.severity, r.message, r.signature, r.affected, r.representativeUrl ?? "", r.rank].map(csvEscape).join(",")),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pseolint-fix-queue-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/dashboard/queue
git commit -m "feat(dashboard): fix queue CSV export"
```

### Task 16: Integrations panel

**Files:**
- Create: `apps/web/src/app/dashboard/integrations/page.tsx`
- Create: `apps/web/src/app/dashboard/settings/tokens/page.tsx`
- Create: `apps/web/src/app/dashboard/settings/tokens/actions.ts`

- [ ] **Step 1: Integrations page**

```tsx
// apps/web/src/app/dashboard/integrations/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getOptionalSession } from "@/lib/session";

export const runtime = "nodejs";

export default async function IntegrationsPage() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/integrations");
  const rows = await db.select().from(integrations).where(eq(integrations.userId, session.user.id));
  const has = (k: string) => rows.some((r) => r.kind === k);

  const yaml = `- run: npx pseolint audit ./out --format json --out report.json
- run: npx pseolint upload report.json --token \${{ secrets.PSEOLINT_TOKEN }} --domain-id <id>`;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <h1 className="text-3xl tracking-tight">Integrations</h1>
      <p className="mt-2 text-sm text-muted-foreground">Connect the systems that tell us when you ship.</p>

      <section className="mt-8 space-y-4">
        <Card title="Search Console" status={has("gsc") ? "connected" : "disconnected"}
              blurb="Cross-references our findings with real impressions. Rank the fix queue by traffic, not guesswork.">
          {has("gsc") ? <span className="text-xs text-success">Connected</span> : (
            <button className="rounded-[14px] border border-border-strong px-3 py-1.5 text-xs" disabled>
              Connect (coming soon, OAuth verification pending)
            </button>
          )}
        </Card>

        <Card title="GitHub Action" status="recipe"
              blurb="Run audits on every PR. Upload results here for cross-run history + regression trends.">
          <pre className="overflow-x-auto rounded-[12px] bg-muted p-4 text-xs">{yaml}</pre>
          <p className="mt-2 text-xs text-muted-foreground">
            You&apos;ll need an upload token, <Link href="/dashboard/settings/tokens" className="text-primary hover:underline">create one</Link>.
          </p>
        </Card>

        <Card title="Daily diff-audit" status="active"
              blurb="On by default for every monitored domain. No setup required.">
          <span className="text-xs text-success">Active</span>
        </Card>

        <Card title="Webflow webhook" status="coming-soon"
              blurb="Audit collections when you publish a new batch of items.">
          <span className="text-xs text-muted-foreground">Ships in v1.1.</span>
        </Card>

        <Card title="WordPress plugin" status="coming-soon"
              blurb="Audit posts and taxonomies on publish. Installed from the WP plugin directory.">
          <span className="text-xs text-muted-foreground">Ships in v1.2.</span>
        </Card>
      </section>
    </main>
  );
}

function Card({ title, status, blurb, children }: { title: string; status: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{status}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Token management page + actions**

```ts
// apps/web/src/app/dashboard/settings/tokens/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { uploadTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getRequiredSession } from "@/lib/session";
import { createUploadToken } from "@/lib/upload-token";

export async function generateToken(label: string): Promise<{ token: string }> {
  const session = await getRequiredSession();
  if (!label.trim()) throw new Error("label required");
  const { token, hash } = await createUploadToken();
  await db.insert(uploadTokens).values({ userId: session.user.id, label: label.trim(), tokenHash: hash });
  revalidatePath("/dashboard/settings/tokens");
  return { token };
}

export async function revokeToken(id: string): Promise<void> {
  const session = await getRequiredSession();
  await db.update(uploadTokens).set({ revokedAt: new Date() })
    .where(and(eq(uploadTokens.id, id), eq(uploadTokens.userId, session.user.id)));
  revalidatePath("/dashboard/settings/tokens");
}
```

```tsx
// apps/web/src/app/dashboard/settings/tokens/page.tsx
import { redirect } from "next/navigation";
import { db } from "@/db";
import { uploadTokens } from "@/db/schema";
import { eq, isNull, and, desc } from "drizzle-orm";
import { getOptionalSession } from "@/lib/session";
import { generateToken, revokeToken } from "./actions";

export const runtime = "nodejs";

export default async function TokensPage({ searchParams }: { searchParams: Promise<{ issued?: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/settings/tokens");
  const { issued } = await searchParams;
  const tokens = await db.select().from(uploadTokens)
    .where(and(eq(uploadTokens.userId, session.user.id), isNull(uploadTokens.revokedAt)))
    .orderBy(desc(uploadTokens.createdAt));

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <h1 className="text-3xl tracking-tight">Upload tokens</h1>
      <p className="mt-2 text-sm text-muted-foreground">Used by the <code>pseolint upload</code> CLI command and your GitHub Action.</p>

      {issued && (
        <div className="mt-6 rounded-[14px] border border-success/40 bg-success/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-success">New token (copy now, you won&apos;t see it again)</p>
          <code className="mt-2 block overflow-x-auto font-mono text-xs">{issued}</code>
        </div>
      )}

      <form action={async (fd) => { "use server"; const out = await generateToken(String(fd.get("label"))); redirect(`/dashboard/settings/tokens?issued=${encodeURIComponent(out.token)}`); }} className="mt-6 flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Label</span>
          <input name="label" required placeholder="e.g. github-actions" className="rounded-[10px] border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-[10px] bg-primary px-4 py-2 text-sm text-primary-foreground">Generate</button>
      </form>

      <ul className="mt-8 space-y-2">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded-[14px] border border-border/60 bg-card/50 p-3">
            <div>
              <p className="text-sm">{t.label}</p>
              <p className="text-xs text-muted-foreground">created {t.createdAt.toISOString().slice(0, 10)}{t.lastUsedAt ? ` · last used ${t.lastUsedAt.toISOString().slice(0, 10)}` : ""}</p>
            </div>
            <form action={async () => { "use server"; await revokeToken(t.id); }}>
              <button type="submit" className="text-xs text-destructive hover:underline">Revoke</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/integrations apps/web/src/app/dashboard/settings
git commit -m "feat(dashboard): integrations panel + upload token management"
```

### Task 17: Nav updates: expose /queue and /integrations when signed in

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Add sub-nav links inside the Dashboard pill area**

In `apps/web/src/app/layout.tsx`, inside `SiteNav` when `signedIn` is true, add two additional text links next to the pill:

```tsx
{signedIn && (
  <>
    <Link href="/dashboard/queue" className="rounded-[12px] px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground">Queue</Link>
    <Link href="/dashboard/integrations" className="rounded-[12px] px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground">Integrations</Link>
  </>
)}
```

Placement: before the "Leaderboard" link to keep Pro surfaces leftmost for signed-in users.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(nav): expose fix queue + integrations entries when signed in"
```

---

## Phase I: Pricing page copy

### Task 18: Apply spec §11 copy edits

**Files:**
- Modify: `apps/web/src/app/pricing/page.tsx`

- [ ] **Step 1: Rewrite PRO_FEATURES and add OSS line**

Edit the `PRO_FEATURES` array in `pricing/page.tsx`:

```ts
const PRO_FEATURES = [
  { title: "Unlimited monitored domains", detail: "Daily diff-audits + weekly full re-audits, running in the background." },
  { title: "Fix queue across your portfolio", detail: "Ranked by severity × pages today; by Search Console impressions once you connect it." },
  { title: "Managed AI triage", detail: "No API keys to configure, daily budget caps enforced. Capability ships in our open-source CLI; Pro removes the ops burden." },
  { title: "Integrations", detail: "GitHub Action upload · Search Console (v1.1) · Webflow (v1.1) · WordPress plugin (v1.2)." },
  { title: "Dashboard + history", detail: "Portfolio strip, per-domain timelines, suppressions that persist across runs." },
  { title: "Private hosted reports + PDF export", detail: "Shareable links. Branded PDF output for stakeholder handoff." },
] as const;
```

Above the `<PlanCard>` grid, add a short line of attribution:

```tsx
<p className="mt-4 text-center text-xs text-muted-foreground">
  The CLI and GitHub Action are free and always will be.
  Pro adds the infrastructure around them.
</p>
```

Update the web-UI crawl budget clarification in the free-tier features copy (replace the existing "200 pages per audit" / "5× free limit" lines):

```ts
const FREE_FEATURES = [
  "Unlimited one-shot audits",
  "Up to 200 pages per audit (web UI) · CLI has no limit",
  "Public shareable report link",
  "Reports kept 24h (anon) / 30d (signed-in)",
];
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/pricing/page.tsx
git commit -m "docs(pricing): reframe Pro copy around hosted infra + OSS attribution"
```

---

## Self-Review

After writing, check against the spec §1–§16:

**Spec coverage:**
- §2 reframe: encoded in positioning; Task 1 (scope) underpins the "every time you ship" promise via diff/full split.
- §3 personas: P2-led onboarding via portfolio strip + fix queue (Tasks 13–14); P1 via integrations panel + upload (Tasks 7–8, 16).
- §4 OSS/Pro boundary: encoded: no OSS rules are gated; Pro adds hosted state (Tasks 2–4), scheduling (Task 5), upload endpoint (Task 7).
- §5.1 portfolio strip: Task 13.
- §5.2 fix queue: Tasks 14–15 + suppression actions.
- §5.3 integrations panel: Task 16.
- §6 core loops: all three (onboarding, day-2, publish-event) are emergent from the surfaces built in Tasks 13–16 and the digest (Task 12).
- §7 data model: Task 2.
- §8 scheduler: Tasks 1 (scope) + 5 (cadence).
- §9 CMS messages: Tasks 9–10.
- §10 alert gating: Task 11.
- §11 pricing: Task 18.
- §12 scope phasing: v1 tasks only; GSC integration card is stubbed (Task 16) per v1.1 plan.
- §13 non-goals: respected (no prediction, no rewriting, no agency features).
- §14 risks: GSC stub + rank fallback covered; CMS collision test covered; suppression misuse visual (suppressed counter) deferred to v1.1: **GAP**.
- §15 success criteria: measurement surfaces deferred; this plan ships the product, not the metrics dashboard.
- §16 open questions: rank materialization handled via cached `rank_score` column (Task 4); upload token rotation via revoke (Task 16); Webflow HMAC: v1.1; GSC privacy floor, v1.1.

**Gap fix:** add a small "X suppressed findings" pill above the fix queue. Fold into Task 14 as an inline addition rather than new task.

**Placeholder scan:** none found. Every step contains runnable code or commands.

**Type consistency:** `RuleResult`, `Severity`, `findingsState` schema, all referenced consistently. `mergeFindings` signature matches between Task 4 definition and Task 5/7 callers. `isoWeekOf` defined once (alert-gate.ts), duplicated in test for clarity. `getRequiredSession` flagged for creation in Task 14 if absent.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-pseolint-pro-reframe-v1.md`. Two execution options:**

**1. Subagent-Driven (recommended)**, I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution**, Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
