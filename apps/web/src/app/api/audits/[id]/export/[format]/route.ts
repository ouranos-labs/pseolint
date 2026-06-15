import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { AuditSummary } from "@pseolint/core";
import { formatMarkdown } from "@pseolint/core";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { getOptionalSession, getOrCreateAnonSessionId } from "@/lib/session";
import { fetchSummaryJson, summaryKey } from "@/lib/r2";
import { trackServerAfter } from "@/lib/analytics/track.server";

export const runtime = "nodejs";

function safeHost(url: string): string {
  try { return new URL(url).host; } catch { return "audit"; }
}

// Disable shared CDN caching of audit dumps and explicitly mark as noindex —
// belt-and-braces alongside the global proxy header.
const EXPORT_HEADERS: Record<string, string> = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; format: string }> },
): Promise<Response> {
  const { id, format } = await params;
  if (format !== "json" && format !== "md") {
    return NextResponse.json({ error: "unsupported format" }, { status: 400 });
  }

  // Sibling routes (/visibility, /triage, GET /audits/[id]) all key on UUID.
  // Keeping this consistent avoids the /[id]-means-slug-here-only footgun.
  const [audit] = await db.select().from(audits).where(eq(audits.id, id)).limit(1);
  if (!audit) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Ownership: owner (sessioned or anon) always allowed; public reports allowed
  // for anyone; private reports owner-only.
  const session = await getOptionalSession();
  const anon = await getOrCreateAnonSessionId();
  const ownedByUser = !!(session?.user.id && audit.userId === session.user.id);
  const ownedByAnon = !session && audit.anonSessionId === anon;
  if (!ownedByUser && !ownedByAnon && !audit.isPublic) {
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

  trackServerAfter({ name: "report_exported", props: { format } }, { profileId: session?.user.id });

  if (format === "json") {
    return new Response(summaryJson, {
      headers: {
        ...EXPORT_HEADERS,
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="pseolint-${stem}-${day}.json"`,
      },
    });
  }

  const summary: AuditSummary = JSON.parse(summaryJson);
  const md = formatMarkdown(summary);
  return new Response(md, {
    headers: {
      ...EXPORT_HEADERS,
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="pseolint-${stem}-${day}.md"`,
    },
  });
}
