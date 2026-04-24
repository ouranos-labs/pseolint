import { pgTable, text, integer, boolean, numeric, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";

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
  score: integer("score"),
  pageCount: integer("page_count"),
  findingCount: integer("finding_count"),
  triageRootCauseCount: integer("triage_root_cause_count"),
  triageCostUsd: numeric("triage_cost_usd", { precision: 10, scale: 4 }),
  storageKey: text("storage_key"),
  errorMessage: text("error_message"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  userIdx: index("audit_user_idx").on(t.userId),
  anonIdx: index("audit_anon_idx").on(t.anonSessionId),
  leaderboardIdx: index("audit_leaderboard_idx").on(t.isPublic, t.status, t.score),
  expiresIdx: index("audit_expires_idx").on(t.expiresAt),
  slugIdx: uniqueIndex("audit_slug_uniq").on(t.slug),
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
  lastScore: integer("last_score"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastFullRunAt: timestamp("last_full_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  /** DNS-TXT ownership challenge token (issued at domain-add time). */
  verificationToken: text("verification_token"),
  /** Verified-at timestamp; null = not verified. Monitoring cron only schedules verified domains. */
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
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
  previousScore: integer("previous_score"),
  currentScore: integer("current_score").notNull(),
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
  scoreDropThreshold: integer("score_drop_threshold").notNull().default(10),
  recipientEmails: text("recipient_emails").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
