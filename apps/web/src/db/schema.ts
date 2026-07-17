import { pgTable, text, integer, boolean, numeric, timestamp, uuid, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import type { ScrapePlanSummary, SiteClassification } from "@pseolint/core";

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userProfiles = pgTable("user_profile", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  polarCustomerId: text("polar_customer_id").unique(),
  plan: text("plan").$type<"free" | "pro">().notNull().default("free"),
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  queueLastVisitedAt: timestamp("queue_last_visited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const audits = pgTable("audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  anonSessionId: text("anon_session_id"),
  sourceUrl: text("source_url").notNull(),
  status: text("status").$type<"queued" | "running" | "completed" | "failed" | "expired">().notNull().default("queued"),
  isPublic: boolean("is_public").notNull().default(true),
  source: text("source").$type<"user" | "seed">().notNull().default("user"),
  /**
   * The /tools/[slug] entry point that created this audit, if any. The audit
   * still runs the FULL rule set (so the report can funnel "we found N more"),
   * this just lets the report render a focused lens view for that tool's
   * `ruleLens`. Null for homepage / dashboard / API audits.
   */
  tool: text("tool"),
  risk: integer("risk"),
  /**
   * The engine's moderated user-facing verdict ("ready" | "caution" |
   * "concerning" | "critical"). Mirrors `AuditSummary.verdict` so the
   * dashboard / portfolio / history surface the moderated signal directly
   * instead of re-deriving it from the raw (unmoderated) `risk`. Nullable for
   * backfill — legacy rows predate this column.
   */
  verdict: text("verdict").$type<"ready" | "caution" | "concerning" | "critical">(),
  pageCount: integer("page_count"),
  findingCount: integer("finding_count"),
  triageRootCauseCount: integer("triage_root_cause_count"),
  triageCostUsd: numeric("triage_cost_usd", { precision: 10, scale: 4 }),
  /**
   * v0.4 §4.11 — pre-flight site classification snapshot. Mirrors the
   * `summary.siteClassification` field on AuditSummary so the dashboard /
   * report page / portfolio strip can display site type without re-fetching
   * the R2 blob. Nullable for backfill — legacy v0.3 audits never had this.
   */
  siteClassification: jsonb("site_classification").$type<SiteClassification>(),
  /**
   * v0.5+ change-driven monitoring summary mirrored from AuditSummary.scrapePlan.
   * Lets the dashboard render "X/Y URLs re-scraped, Z carried forward" without
   * reading the full R2 blob. Nullable: only populated on monitoring runs
   * (prior state existed and not --mode=fresh); fresh / one-shot / filesystem
   * audits don't produce a scrapePlan.
   */
  scrapePlan: jsonb("scrape_plan").$type<ScrapePlanSummary>(),
  /**
   * True when the engine's backpressure watchdog aborted the crawl mid-flight
   * (degraded origin) and flushed a PARTIAL report — counts/verdict/risk are
   * lower bounds. Mirrors `AuditSummary.truncated`. Defaults false; legacy rows
   * and complete runs are false. Lets the dashboard filter/flag degraded audits
   * without round-tripping the R2 blob.
   */
  truncated: boolean("truncated").notNull().default(false),
  /** Human-readable reason the run was truncated. Mirrors `AuditSummary.truncatedReason`; null when not truncated. */
  truncatedReason: text("truncated_reason"),
  storageKey: text("storage_key"),
  errorMessage: text("error_message"),
  /** OG metadata captured from the audited site's homepage — used by the leaderboard
   *  card layout. Lazily backfilled on leaderboard render for legacy rows. */
  ogTitle: text("og_title"),
  ogDescription: text("og_description"),
  ogImageUrl: text("og_image_url"),
  host: text("host"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  userIdx: index("audit_user_idx").on(t.userId),
  anonIdx: index("audit_anon_idx").on(t.anonSessionId),
  leaderboardIdx: index("audit_leaderboard_idx").on(t.isPublic, t.status, t.host, t.risk),
  expiresIdx: index("audit_expires_idx").on(t.expiresAt),
  slugIdx: uniqueIndex("audit_slug_uniq").on(t.slug),
}));

/**
 * Singleton row holding the seed-audit aggregate stat shown on the leaderboard
 * ("We audited N well-known pSEO sites; M passed; median X"). Recomputed by the
 * seed-leaderboard Inngest function. `id` is always the literal "singleton".
 */
export const seedStats = pgTable("seed_stats", {
  id: text("id").primaryKey().default("singleton"),
  auditedCount: integer("audited_count").notNull().default(0),
  passedCount: integer("passed_count").notNull().default(0),
  medianRisk: integer("median_risk"),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Verified ownership claims for leaderboard hosts. One row per host = claimed.
 * Absence = unclaimed. Only VERIFIED claims live here (DNS or GSC); pending DNS
 * challenges are stateless (deterministic token, see lib/leaderboard-claims.ts).
 */
export const leaderboardClaims = pgTable("leaderboard_claim", {
  host: text("host").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  method: text("method").$type<"dns" | "gsc">().notNull(),
  ogTitleOverride: text("og_title_override"),
  ogDescriptionOverride: text("og_description_override"),
  pinnedAuditId: uuid("pinned_audit_id"),
  isHidden: boolean("is_hidden").notNull().default(false),
}, (t) => ({
  userIdx: index("leaderboard_claim_user_idx").on(t.userId),
}));

export const monitoredDomains = pgTable("monitored_domain", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  host: text("host").notNull(),
  cadence: text("cadence").$type<"weekly" | "daily">().notNull().default("weekly"),
  paused: boolean("paused").notNull().default(false),
  alertEmail: text("alert_email"),
  alertThreshold: integer("alert_threshold").notNull().default(10),
  lastAuditId: uuid("last_audit_id"),
  lastRisk: integer("last_risk"),
  /**
   * The engine's moderated verdict from the latest audit ("ready" | "caution"
   * | "concerning" | "critical"). Mirrors `AuditSummary.verdict`, synced
   * alongside `lastRisk`, so the portfolio strip / workspace header show the
   * moderated signal rather than re-deriving it from `lastRisk`. Nullable for
   * backfill.
   */
  lastVerdict: text("last_verdict").$type<"ready" | "caution" | "concerning" | "critical">(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastFullRunAt: timestamp("last_full_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  /** DNS-TXT ownership challenge token (issued at domain-add time). */
  verificationToken: text("verification_token"),
  /** Verified-at timestamp; null = not verified. Monitoring cron only schedules verified domains. */
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  /**
   * GSC property URL bound to this domain (e.g. "sc-domain:example.com" or
   * "https://example.com/"). Null = no GSC binding; the sync cron skips this
   * domain and the rank scoring falls back to severity×pages without traffic
   * weighting. The OAuth grant lives on the user (one row per user in
   * `integrations` with kind='gsc'); per-domain we only need to record which
   * verified property within that grant feeds this row.
   */
  gscSiteUrl: text("gsc_site_url"),
  /** Optional Slack incoming webhook URL. Presence enables Slack alerts; null = disabled. */
  slackWebhookUrl: text("slack_webhook_url"),
  /**
   * "Gentle audit mode" — caps concurrency to 2 and sample size to 200 for any
   * audit run against this domain (manual re-audit + monitoring crons). Set
   * by users whose origin is small / un-CDN'd / hits a rate limit when the
   * default 5-parallel / 500-page Pro audit fans out. The engine's existing
   * backpressure guard is what reveals the need for this; the toggle lets the
   * user trade thoroughness for politeness without us second-guessing.
   */
  gentleAuditMode: boolean("gentle_audit_mode").notNull().default(false),
  /**
   * Bring-your-own domain authority (0-100, e.g. Moz DA / Ahrefs DR). When set,
   * moderates the verdict one tier (engine's shiftVerdictForAuthority): >=80
   * lenient, <=30 stricter. Null = unset → no shift. Persisted per-domain (a
   * domain's authority is stable), not a per-audit input.
   */
  authorityScore: integer("authority_score"),
  /**
   * Per-domain render-mode opt-in (Pro). When true, audits against this domain
   * render each page in a headless browser (the operator's Browserless CDP
   * endpoint, PSEOLINT_BROWSER_WS) before auditing — needed for JS-heavy / SPA
   * sites (Webflow, Framer, client-rendered Next) whose server HTML looks empty
   * to a static fetch. Null/false = static fetch. Nullable (no default) to
   * mirror authorityScore: absence means "unset", not an active choice.
   */
  renderMode: boolean("render_mode"),
  /** Per-domain IndexNow API key (must be served at /[key].txt on the origin). */
  indexNowKey: text("indexnow_key"),
  /**
   * Per-domain advanced scan options (Pro). JSON-serialized, allowlisted subset
   * of `AuditOptions` — see lib/scan-options.ts `ScanOptions`. Only the 7 safe
   * engine knobs (crawlDiscovery, fillBudgetViaLinkDiscovery, samplingStrategy,
   * maxPerTemplate, strict, pageGroups, entityPatterns) are ever stored here;
   * the schema's `.strict()` and run-audit's spread order (validated override
   * first, fixed safety opts after) keep this from becoming a way to disable
   * safeMode / SSRF guard / robots / noindex / caps. Null = no overrides →
   * engine defaults. Stored as text JSON for consistency with
   * `domainRuleOverrides` / `domainDataSources`.
   */
  scanOptions: text("scan_options"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("monitored_user_idx").on(t.userId),
  nextRunIdx: index("monitored_next_run_idx").on(t.nextRunAt, t.paused),
  userDomainUniq: uniqueIndex("monitored_user_domain_uniq").on(t.userId, t.host),
  slugIdx: uniqueIndex("monitored_slug_uniq").on(t.slug),
}));

export const monitoringAlerts = pgTable("monitoring_alert", {
  id: uuid("id").primaryKey().defaultRandom(),
  monitoredDomainId: uuid("monitored_domain_id").notNull().references(() => monitoredDomains.id, { onDelete: "cascade" }),
  auditId: uuid("audit_id").notNull(),
  previousAuditId: uuid("previous_audit_id"),
  previousRisk: integer("previous_risk"),
  currentRisk: integer("current_risk").notNull(),
  newRuleIds: text("new_rule_ids").array().notNull().default([]),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  domainIdx: index("alert_domain_idx").on(t.monitoredDomainId),
}));

export const blocklist = pgTable("blocklist", {
  key: text("key").primaryKey(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const webhookEvents = pgTable("webhook_event", {
  eventId: text("event_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  kind: text("kind").$type<"gsc" | "github" | "webflow" | "wordpress" | "google-indexing" | "indexnow">().notNull(),
  encryptedTokens: text("encrypted_tokens"),
  scope: text("scope"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userKindUniq: uniqueIndex("integration_user_kind_uniq").on(t.userId, t.kind),
}));

export const indexingRequests = pgTable("indexing_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id").notNull().references(() => monitoredDomains.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  provider: text("provider").$type<"google" | "indexnow">().notNull(),
  status: text("status").$type<"pending" | "completed" | "failed">().notNull().default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  domainUrlIdx: index("indexing_request_domain_url_idx").on(t.domainId, t.url),
  userIdx: index("indexing_request_user_idx").on(t.userId),
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

export const growthSearchMetrics = pgTable("growth_search_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  // '' (empty) = page-level aggregate row; non-empty = a page+query row.
  // Empty-string sentinel (not NULL) so the unique index dedupes page-level
  // rows across weekly runs — Postgres treats NULLs as distinct.
  query: text("query").notNull().default(""),
  weekBucket: text("week_bucket").notNull(), // ISO week "YYYY-Www" (UTC)
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  positionAvg: numeric("position_avg", { precision: 6, scale: 2 }),
  ctrAvg: numeric("ctr_avg", { precision: 6, scale: 4 }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  key: uniqueIndex("growth_metrics_key_uniq").on(t.url, t.query, t.weekBucket),
  weekIdx: index("growth_metrics_week_idx").on(t.weekBucket),
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

export const usageLog = pgTable("usage_log", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"ai_triage">().notNull(),
  monthYyyymm: text("month_yyyymm").notNull(),   // e.g. "2026-04"
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: uniqueIndex("usage_log_pk").on(t.userId, t.kind, t.monthYyyymm),
}));

export const alertDefaults = pgTable("alert_default", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  riskRiseThreshold: integer("risk_rise_threshold").notNull().default(10),
  recipientEmails: text("recipient_emails").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-domain data-source uploads for pSEO data-binding rule.
 * JSON array of PageDataRecord passed into auditSource({ dataSource }).
 */
export const domainDataSources = pgTable("domain_data_source", {
  domainId: uuid("domain_id").primaryKey().references(() => monitoredDomains.id, { onDelete: "cascade" }),
  records: text("records").notNull(), // JSON-serialized PageDataRecord[]
  recordCount: integer("record_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * BYO AI-provider key. One row per user. When present, triage uses the user's
 * key + provider instead of the server's managed Anthropic key — lets free-tier
 * users run unlimited AI triage by paying their own LLM costs, and lets Pro
 * users use a non-default provider.
 */
export const userAiKeys = pgTable("user_ai_key", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),        // "anthropic" | "openai" | etc.
  model: text("model"),                         // optional model override
  apiKey: text("api_key").notNull(),            // stored at rest, only used server-side
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-domain rule threshold overrides. JSON-serialized Partial<AuditOptions.rules>.
 * Loose thresholds for landing pages, strict thresholds for pSEO templates, etc.
 */
export const domainRuleOverrides = pgTable("domain_rule_override", {
  domainId: uuid("domain_id").primaryKey().references(() => monitoredDomains.id, { onDelete: "cascade" }),
  overrides: text("overrides").notNull(),   // JSON-serialized AuditOptions["rules"]
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * v0.5.3 — Pro "watched pages" list. Each row pins a single URL on a
 * monitored domain; the engine forces a refetch on every monitoring run for
 * URLs in this list (RefetchReason="watched"), guaranteeing diff-mode never
 * skips them. Free users see an upgrade CTA — no rows are created for them.
 *
 * Hard cap of 20 per domain enforced atomically in the add server action.
 * URL is stored verbatim after the same `normalizeUserUrl` pass used by the
 * add-domain flow; uniqueness is on (monitoredDomainId, normalized url).
 * Cascade delete tied to the domain so soft-removing a domain wipes its
 * watched list — domain row removal is soft (sets `removedAt`), so the
 * explicit cleanup happens in `removeDomainAction`; the FK cascade only
 * fires on hard deletes.
 */
export const watchedPages = pgTable("watched_page", {
  id: uuid("id").primaryKey().defaultRandom(),
  monitoredDomainId: uuid("monitored_domain_id")
    .notNull()
    .references(() => monitoredDomains.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  addedByUserId: text("added_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Stamped by the audit pipeline after the URL was last included as forced-refetch.
   *  Null = never audited (the on-add Inngest event hasn't completed). */
  lastAuditedAt: timestamp("last_audited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  domainIdx: index("watched_page_domain_idx").on(t.monitoredDomainId),
  domainUrlUniq: uniqueIndex("watched_page_domain_url_uniq").on(t.monitoredDomainId, t.url),
}));

/**
 * AI-orchestrator session row. One per `orchestrate()` invocation. Tracks
 * budget consumption, terminal status, and pointers into R2 for the durable
 * NDJSON event log. The actual fix manifest (when produced) lives in
 * `fixManifests`, joined by session_id.
 *
 * Note: not the same as the better-auth `sessions` table — this one is
 * specific to orchestrator runs. Distinct table name (`orchestrator_session`)
 * prevents collision.
 */
export const orchestratorSessions = pgTable("orchestrator_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  status: text("status").$type<"queued" | "running" | "completed" | "failed" | "aborted">().notNull().default("queued"),
  /** StopReason from `@pseolint/core` — completed | tool_call_limit | usd_limit | etc. */
  reason: text("reason"),
  /** Optional focus note from AI triage, appended to the orchestrator system prompt. */
  brief: text("brief"),
  /** Hard USD cap configured for this session. Mirrors BudgetCaps.maxSessionUsd. */
  budgetUsd: numeric("budget_usd", { precision: 10, scale: 4 }).notNull(),
  /** Actual USD spent (LLM tokens + external probe APIs). */
  spentUsd: numeric("spent_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  toolCallCount: integer("tool_call_count").notNull().default(0),
  durationMs: integer("duration_ms"),
  modelId: text("model_id"),
  providerId: text("provider_id"),
  /** R2 key for the durable NDJSON event log — `orchestrator/<id>/log.ndjson`. */
  logKey: text("log_key"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  userIdx: index("orch_session_user_idx").on(t.userId),
  statusIdx: index("orch_session_status_idx").on(t.status),
  startedIdx: index("orch_session_started_idx").on(t.startedAt),
}));

/**
 * Fix manifest produced by a successful orchestrator session. Stored as
 * a row keyed by `slug` (used for `/m/<slug>` URLs) plus an R2 pointer to
 * the full manifest JSON. Top-level counts mirrored for dashboard rendering
 * without re-fetching R2.
 */
export const fixManifests = pgTable("fix_manifest", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => orchestratorSessions.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  schemaVersion: text("schema_version").notNull(),
  domain: text("domain").notNull(),
  verdict: text("verdict").$type<"ready" | "caution" | "concerning" | "critical">().notNull(),
  pagePatchCount: integer("page_patch_count").notNull().default(0),
  templatePatchCount: integer("template_patch_count").notNull().default(0),
  domainPatchCount: integer("domain_patch_count").notNull().default(0),
  validPatchCount: integer("valid_patch_count").notNull().default(0),
  totalPatchCount: integer("total_patch_count").notNull().default(0),
  /** R2 key for the manifest + validation + diff JSON blob. */
  manifestKey: text("manifest_key").notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugIdx: uniqueIndex("fix_manifest_slug_uniq").on(t.slug),
  sessionIdx: index("fix_manifest_session_idx").on(t.sessionId),
  domainIdx: index("fix_manifest_domain_idx").on(t.domain),
}));

/**
 * Self-managed API keys for the remote MCP endpoint. Keys are independent of
 * better-auth (this version has no apiKey plugin). `keyHash` is a sha256 hex
 * of the token (unique, used for lookup); `prefix` is the first 8 chars shown
 * in the dashboard; `revokedAt` is a soft-delete sentinel.
 */
export const mcpApiKeys = pgTable(
  "mcp_api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mcp_api_key_user_idx").on(t.userId)],
);

export const serpScans = pgTable("serp_scans", {
  id: uuid("id").primaryKey().defaultRandom(),
  query: text("query").notNull(),
  searchUrl: text("search_url").notNull(),
  totalResults: integer("total_results").notNull(),
  templatedResults: integer("templated_results").notNull(),
  aioCitations: jsonb("aio_citations").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competitorPages = pgTable("competitor_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanId: uuid("scan_id").references(() => serpScans.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  rank: integer("rank").notNull(),
  wordCount: integer("word_count").notNull(),
  hasSchema: boolean("has_schema").notNull(),
  isTitleRewritten: boolean("is_title_rewritten").notNull(),
  isMetaDescIgnored: boolean("is_meta_desc_ignored").notNull(),
  flags: jsonb("flags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  scanIdx: index("competitor_page_scan_idx").on(t.scanId),
}));

