import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { AuditSummary } from "@pseolint/core";
import { formatMarkdown } from "@pseolint/core";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { fetchSummaryJson, summaryKey } from "@/lib/r2";

export const runtime = "nodejs";

type Format = "json" | "md";

function safeHost(url: string): string {
  try { return new URL(url).host; } catch { return "audit"; }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; format: string }> },
): Promise<Response> {
  const { id, format } = await params;
  if (format !== "json" && format !== "md") {
    return NextResponse.json({ error: "unsupported format" }, { status: 400 });
  }

  const [audit] = await db.select().from(audits).where(eq(audits.slug, id)).limit(1);
  if (!audit) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Ownership: owner always allowed; public reports allowed for anyone; private reports owner-only.
  const session = await getOptionalSession();
  const ownedByUser = session && audit.userId === session.user.id;
  if (!ownedByUser && !audit.isPublic) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!audit.storageKey) {
    return NextResponse.json({ error: "audit not yet complete" }, { status: 409 });
  }

  const summaryJson = await fetchSummaryJson(summaryKey(audit.id));
  if (!summaryJson) {
    return NextResponse.json({ error: "summary unavailable" }, { status: 410 });
  }

  const stem = safeHost(audit.sourceUrl).replace(/[^a-z0-9.-]/gi, "_");
  const day = (audit.completedAt ?? audit.createdAt).toISOString().slice(0, 10);

  if (format === "json") {
    return new Response(summaryJson, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="pseolint-${stem}-${day}.json"`,
      },
    });
  }

  // Markdown
  const summary: AuditSummary = JSON.parse(summaryJson);
  const md = formatMarkdown(summary);
  return new Response(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="pseolint-${stem}-${day}.md"`,
    },
  });
}
