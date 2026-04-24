import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Minimal liveness + DB readiness probe. Returns 503 if the DB is unreachable
 * so uptime monitors (Better Stack, Upptime, etc.) can page on it.
 */
export async function GET(): Promise<Response> {
  try {
    await db.execute(sql`select 1 as ok`);
    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "db unreachable" },
      { status: 503 },
    );
  }
}
