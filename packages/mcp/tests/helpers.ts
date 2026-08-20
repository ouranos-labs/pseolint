import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Connect a real MCP `Client` to the given server over an in-memory transport.
 * `listTools()` is called so the client caches each tool's output-schema
 * validator: successful tool results are then validated client-side against
 * `outputSchema`, which is the core of these battle tests.
 */
export async function connect(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "battle-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  await client.listTools();
  return client;
}

export interface CallResult {
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function textOf(result: CallResult): string {
  return result.content.map((c) => c.text).join("\n");
}

// --- Fixture builders --------------------------------------------------------
// MCP only reads a handful of fields off these, so we cast partials rather than
// constructing full core types. Keep in sync with what server.ts touches.

export function makeFinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ruleId: "spam/thin-content",
    severity: "warning",
    message: "Thin content detected",
    fix: "Add more unique content",
    effort: "quick",
    pageUrl: "https://example.com/a",
    ...overrides,
  };
}

interface SummaryOverrides {
  verdict?: string;
  risk?: number;
  pageCount?: number;
  blockers?: Array<Record<string, unknown>>;
  shouldFix?: Array<Record<string, unknown>>;
  informational?: Array<Record<string, unknown>>;
  templates?: Array<Record<string, unknown>>;
  categories?: Record<string, { grade: string; issues: number }>;
  templateDetected?: boolean;
  truncated?: boolean;
  truncatedReason?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeSummary(o: SummaryOverrides = {}): any {
  return {
    schemaVersion: "2026-06-v0.6",
    verdict: o.verdict ?? "caution",
    risk: o.risk ?? 25,
    headline: "1 should-fix",
    categories: o.categories ?? {
      integrity: { grade: "B", issues: 2 },
      discoverability: { grade: "A", issues: 0 },
      citation: { grade: "C", issues: 5 },
      data: { grade: "A", issues: 0 },
      // weight-0 diagnostics bucket; must be filtered out of structured output
      audit: { grade: "A", issues: 0 },
    },
    issues: {
      blockers: o.blockers ?? [],
      shouldFix: o.shouldFix ?? [makeFinding()],
      informational: o.informational ?? [],
    },
    siteClassification: { type: "programmatic-directory", confidence: 0.9, suppressedRules: [] },
    diagnostics: {},
    pageCount: o.pageCount ?? 12,
    templates: o.templates ?? [],
    templateDetected: o.templateDetected ?? false,
    ...(o.truncated ? { truncated: true, truncatedReason: o.truncatedReason ?? "origin degraded" } : {}),
  };
}

export function makeTemplate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    signature: "/listing/:slug",
    totalUrls: 100,
    totalDiscoveredUrls: 120,
    auditedUrls: ["https://example.com/listing/a", "https://example.com/listing/b"],
    verdict: "concerning",
    risk: 60,
    categories: {
      integrity: { grade: "D", issues: 8 },
      discoverability: { grade: "B", issues: 1 },
      citation: { grade: "C", issues: 3 },
      data: { grade: "A", issues: 0 },
      audit: { grade: "A", issues: 0 },
    },
    variance: { ruleFireRates: {}, uniformityScore: 0.85, topDriver: { ruleId: "spam/thin-content", fireRate: 0.8 } },
    findingIds: [],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeManifest(overrides: Record<string, unknown> = {}): any {
  return {
    domain: "https://example.com",
    verdict: "caution",
    categories: { integrity: "B", discoverability: "A", citation: "C", data: "A" },
    pages: [{ url: "https://example.com/a", changes: [{ type: "rewrite-h1" }] }],
    templates: [{ templateId: "t1", affectedUrlCount: 10, recommendation: "Differentiate intros" }],
    domainLevel: [{ type: "robots", reason: "Sitemap missing" }],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeOrchestrateResult(overrides: { reason?: string; manifest?: unknown; validation?: unknown } = {}): any {
  return {
    session: {
      reason: overrides.reason ?? "completed",
      usage: { toolCallCount: 5, estimatedUsd: 0.5, elapsedMs: 1234, inputTokens: 100, outputTokens: 50 },
      error: undefined,
    },
    manifest: overrides.manifest === undefined ? makeManifest() : overrides.manifest,
    validation: overrides.validation === undefined
      ? { validPatches: 3, totalPatches: 4, failures: [{ reason: "schema" }] }
      : overrides.validation,
    diff: "--- a\n+++ b\n",
  };
}
