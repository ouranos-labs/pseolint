import { NextRequest } from "next/server";
import { and, eq, gt, isNotNull, lt, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { LEADERBOARD_RISK_MAX, LEADERBOARD_MIN_PAGES } from "@/lib/leaderboard";
import { gradeOf } from "@/lib/grade";

export const runtime = "nodejs";
export const revalidate = 600;

/** Minimal SVG badge: "pseolint · Grade A". Verdict/grade only — never a numeric risk. */
function badgeSvg(grade: string): string {
  const label = "pseolint";
  const value = `Grade ${grade}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="148" height="20" role="img" aria-label="${label}: ${value}">
  <rect width="78" height="20" fill="#1f2328"/>
  <rect x="78" width="70" height="20" fill="#0a7d33"/>
  <g fill="#fff" font-family="Verdana,Geneva,sans-serif" font-size="11">
    <text x="8" y="14">${label}</text>
    <text x="86" y="14">${value}</text>
  </g>
</svg>`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ host: string }> }) {
  const { host } = await ctx.params;
  const decoded = decodeURIComponent(host).toLowerCase();

  const [row] = await db
    .select({ risk: audits.risk })
    .from(audits)
    .where(
      and(
        eq(audits.host, decoded),
        eq(audits.isPublic, true),
        eq(audits.status, "completed"),
        isNotNull(audits.risk),
        lt(audits.risk, LEADERBOARD_RISK_MAX),
        gt(audits.expiresAt, new Date()),
        sql`${audits.pageCount} >= ${LEADERBOARD_MIN_PAGES}`,
      ),
    )
    .orderBy(desc(audits.createdAt))
    .limit(1);

  if (!row || row.risk === null) {
    return new Response("Not found", { status: 404 });
  }

  const grade = gradeOf(row.risk).letter;
  return new Response(badgeSvg(grade), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
