// apps/web/src/app/dashboard/settings/tokens/page.tsx
import { redirect } from "next/navigation";
import { db } from "@/db";
import { uploadTokens } from "@/db/schema";
import { eq, isNull, and, desc } from "drizzle-orm";
import { getOptionalSession } from "@/lib/session";
import { generateToken, revokeToken } from "./actions";

export const runtime = "nodejs";

export default async function TokensPage({ searchParams }: { searchParams: Promise<{ issued?: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/settings/tokens");
  const { issued } = await searchParams;
  const tokens = await db.select().from(uploadTokens)
    .where(and(eq(uploadTokens.userId, session.user.id), isNull(uploadTokens.revokedAt)))
    .orderBy(desc(uploadTokens.createdAt));

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <h1 className="text-3xl tracking-tight">Upload tokens</h1>
      <p className="mt-2 text-sm text-muted-foreground">Used by the <code>pseolint upload</code> CLI command and your GitHub Action.</p>

      {issued && (
        <div className="mt-6 rounded-[14px] border border-success/40 bg-success/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-success">New token (copy now — you won&apos;t see it again)</p>
          <code className="mt-2 block overflow-x-auto font-mono text-xs">{issued}</code>
        </div>
      )}

      <form action={async (fd) => { "use server"; const out = await generateToken(String(fd.get("label"))); redirect(`/dashboard/settings/tokens?issued=${encodeURIComponent(out.token)}`); }} className="mt-6 flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Label</span>
          <input name="label" required placeholder="e.g. github-actions" className="rounded-[10px] border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-[10px] bg-primary px-4 py-2 text-sm text-primary-foreground">Generate</button>
      </form>

      <ul className="mt-8 space-y-2">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded-[14px] border border-border/60 bg-card/50 p-3">
            <div>
              <p className="text-sm">{t.label}</p>
              <p className="text-xs text-muted-foreground">created {t.createdAt.toISOString().slice(0, 10)}{t.lastUsedAt ? ` · last used ${t.lastUsedAt.toISOString().slice(0, 10)}` : ""}</p>
            </div>
            <form action={async () => { "use server"; await revokeToken(t.id); }}>
              <button type="submit" className="text-xs text-destructive hover:underline">Revoke</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
