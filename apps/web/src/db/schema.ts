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
}));

export const monitoredDomains = pgTable("monitored_domain", {
  id: uuid("id").primaryKey().defaultRandom(),
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
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("monitored_user_idx").on(t.userId),
  nextRunIdx: index("monitored_next_run_idx").on(t.nextRunAt, t.paused),
  userDomainUniq: uniqueIndex("monitored_user_domain_uniq").on(t.userId, t.host),
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
