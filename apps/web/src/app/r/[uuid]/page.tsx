import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { signedReportUrl } from "@/lib/r2";
import { getOptionalSession, getOrCreateAnonSessionId } from "@/lib/session";

export const runtime = "nodejs";

export default async function Page({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  const [row] = await db.select().from(audits).where(eq(audits.id, uuid)).limit(1);
  if (!row || row.status !== "completed" || !row.storageKey) notFound();
  if (row.expiresAt.getTime() < Date.now()) notFound();

  const session = await getOptionalSession();
  const anon = await getOrCreateAnonSessionId();
  const ownedByUser = session?.user.id && row.userId === session.user.id;
  const ownedByAnon = !session && row.anonSessionId === anon;
  if (!row.isPublic && !ownedByUser && !ownedByAnon) redirect("/signin");

  const url = await signedReportUrl(row.storageKey, 300);
  return (
    <iframe
      src={url}
      sandbox=""
      title="pseolint audit report"
      className="h-screen w-full border-0"
    />
  );
}
