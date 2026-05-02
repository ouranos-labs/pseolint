import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fixManifests, orchestratorSessions } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { OrchestratorProgress } from "./progress";

export const runtime = "nodejs";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const [row] = await db
    .select()
    .from(orchestratorSessions)
    .where(eq(orchestratorSessions.id, id))
    .limit(1);
  if (!row) notFound();
  if (row.userId !== session.user.id) notFound(); // owner-only

  // If completed, jump straight to the manifest view if one was produced.
  if (row.status === "completed") {
    const [manifest] = await db
      .select({ slug: fixManifests.slug })
      .from(fixManifests)
      .where(eq(fixManifests.sessionId, id))
      .limit(1);
    if (manifest) redirect(`/m/${manifest.slug}`);
  }

  return <OrchestratorProgress sessionId={id} initialDomain={row.domain} initialStatus={row.status} />;
}
