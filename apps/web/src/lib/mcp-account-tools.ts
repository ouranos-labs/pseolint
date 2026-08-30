import "server-only";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { formatMarkdown, type AuditSummary, type RuleResult } from "@pseolint/core";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { env } from "@/lib/env";
import { fetchSummaryJson, summaryKey } from "@/lib/r2";

/** Max rows a single pseolint_list_audits call returns. */
const MAX_ROWS = 50;
/** Findings carried in structuredContent; the markdown text has them all (up to the char cap). */
const FINDINGS_CAP = 60;
/** Same 25k budget the engine tools use for human-readable text. */
const CHAR_LIMIT = 25_000;

const FINDING_SCHEMA = z.object({
  ruleId: z.string(),
  severity: z.string(),
  message: z.string(),
  fix: z.string().optional(),
  effort: z.string().optional(),
  pageUrl: z.string().optional(),
});

/**
 * The SDK types tool schemas against a zod3/zod4 compat union that TypeScript
 * resolves to the z3 branch, so plain zod-4 shapes fail structurally. One cast,
 * one place, no runtime cost. Mirrors zodShape() in packages/mcp/src/server.ts.
 */
function zodShape<T extends Record<string, z.ZodTypeAny>>(shape: T): T & ZodRawShapeCompat {
  return shape as unknown as T & ZodRawShapeCompat;
}

function toFinding(f: RuleResult) {
  return {
    ruleId: f.ruleId,
    severity: f.severity,
    message: f.message,
    ...(f.fix ? { fix: f.fix } : {}),
    ...(f.effort ? { effort: f.effort } : {}),
    ...(f.pageUrl ? { pageUrl: f.pageUrl } : {}),
  };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/**
 * Tools that read the caller's OWN stored audits. Registered only for `key`
 * identities (see /api/[transport]/route.ts), and every query is scoped by
 * userId, so an API key never reaches another account's reports.
 *
 * Why they exist: without them an assistant holding a key can only re-crawl a
 * site to learn what is wrong with it, which costs time, quota and (with
 * contentEffort) real money, while the answer is already sitting in the report
 * the user already ran.
 */
export function registerAccountTools(server: McpServer, userId: string): void {
  server.registerTool(
    "pseolint_list_audits",
    {
      title: "List My Saved pseolint Audits",
      description:
        "Use FIRST, before pseolint_audit_site, when the user refers to an audit they already ran ('my audit', 'the report for example.com', 'the issues you found'). Lists the completed audits stored on this account, newest first, with slug, host, verdict, risk and finding count. Then pass a slug to pseolint_get_audit to read the findings: no re-crawl, no extra cost. Requires an API key.",
      inputSchema: zodShape({
        host: z.string().optional().describe("Filter to one host, e.g. example.com (exact match, no scheme)"),
        limit: z.number().int().min(1).max(MAX_ROWS).optional().default(10).describe(`Max audits to return (default 10, max ${MAX_ROWS})`),
      }),
      outputSchema: zodShape({
        audits: z.array(z.object({
          slug: z.string(),
          host: z.string().nullable(),
          sourceUrl: z.string(),
          verdict: z.string().nullable(),
          risk: z.number().nullable(),
          pageCount: z.number().nullable(),
          findingCount: z.number().nullable(),
          createdAt: z.string(),
          reportUrl: z.string(),
        })),
        count: z.number(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ host, limit }: { host?: string; limit: number }) => {
      const scope = [eq(audits.userId, userId), eq(audits.status, "completed")];
      if (host) scope.push(eq(audits.host, host));

      const rows = await db
        .select({
          slug: audits.slug,
          host: audits.host,
          sourceUrl: audits.sourceUrl,
          verdict: audits.verdict,
          risk: audits.risk,
          pageCount: audits.pageCount,
          findingCount: audits.findingCount,
          createdAt: audits.createdAt,
        })
        .from(audits)
        .where(and(...scope))
        .orderBy(desc(audits.createdAt))
        .limit(limit);

      const base = env().BETTER_AUTH_URL;
      const list = rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        reportUrl: `${base}/r/${r.slug}`,
      }));

      const text = list.length === 0
        ? host
          ? `No completed audits for ${host} on this account.`
          : "No completed audits on this account yet. Run pseolint_audit_site to create one."
        : [
            `${list.length} audit${list.length === 1 ? "" : "s"} on this account (newest first):`,
            "",
            ...list.map((a) =>
              `- ${a.slug} | ${a.host ?? a.sourceUrl} | ${a.verdict ?? "?"} (risk ${a.risk ?? "?"}) | ` +
              `${a.findingCount ?? "?"} findings | ${a.pageCount ?? "?"} pages | ${a.createdAt.slice(0, 10)}`),
            "",
            "Read one with pseolint_get_audit(slug) instead of re-auditing the site.",
          ].join("\n");

      return { content: [{ type: "text" as const, text }], structuredContent: { audits: list, count: list.length } };
    },
  );

  server.registerTool(
    "pseolint_get_audit",
    {
      title: "Read a Saved pseolint Audit",
      description:
        "Use when the user wants to act on an audit they already ran: returns the stored report (verdict, risk, per-category grades, per-template breakdown and every finding with its fix) as markdown, plus structured findings with ruleId/severity/pageUrl/fix to drive code changes. Get the slug from pseolint_list_audits. Reads storage only: no crawl, no cost, and the numbers match what the user sees on the report page. Requires an API key.",
      inputSchema: zodShape({
        slug: z.string().min(1).describe("Audit slug from pseolint_list_audits (also the last path segment of a /r/<slug> report URL)"),
      }),
      outputSchema: zodShape({
        slug: z.string(),
        sourceUrl: z.string(),
        verdict: z.string(),
        risk: z.number(),
        pageCount: z.number(),
        findings: z.array(FINDING_SCHEMA).describe(`Up to ${FINDINGS_CAP} findings, blockers first. See findingCount for the total.`),
        findingCount: z.number(),
        findingsTruncated: z.boolean().optional(),
        textTruncated: z.boolean().optional(),
        createdAt: z.string(),
        reportUrl: z.string(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ slug }: { slug: string }) => {
      // Scoped by userId: a key only ever reads its own account's audits, and an
      // unknown slug is indistinguishable from someone else's (no enumeration).
      const [row] = await db
        .select()
        .from(audits)
        .where(and(eq(audits.slug, slug), eq(audits.userId, userId)))
        .limit(1);

      if (!row) return err(`No audit "${slug}" on this account. Call pseolint_list_audits to see the available slugs.`);
      if (row.status !== "completed") return err(`Audit "${slug}" is ${row.status}, not completed. Nothing to read yet.`);

      const json = row.storageKey ? await fetchSummaryJson(summaryKey(row.id)) : null;
      if (!json) return err(`The stored report for "${slug}" is gone (expired or still uploading). Re-run pseolint_audit_site on ${row.sourceUrl} to regenerate it.`);

      const summary: AuditSummary = JSON.parse(json);
      const findings = [
        ...summary.issues.blockers,
        ...summary.issues.shouldFix,
        ...summary.issues.informational,
      ];

      const reportUrl = `${env().BETTER_AUTH_URL}/r/${slug}`;
      let text = formatMarkdown(summary);
      const textTruncated = text.length > CHAR_LIMIT;
      if (textTruncated) {
        text = `${text.slice(0, CHAR_LIMIT)}\n\n[truncated] Full report: ${reportUrl}`;
      }

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          slug,
          sourceUrl: row.sourceUrl,
          verdict: summary.verdict,
          risk: summary.risk,
          pageCount: summary.pageCount,
          findings: findings.slice(0, FINDINGS_CAP).map(toFinding),
          findingCount: findings.length,
          ...(findings.length > FINDINGS_CAP ? { findingsTruncated: true } : {}),
          ...(textTruncated ? { textTruncated: true } : {}),
          createdAt: (row.completedAt ?? row.createdAt).toISOString(),
          reportUrl,
        },
      };
    },
  );
}
