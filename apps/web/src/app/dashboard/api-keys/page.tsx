import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { uploadTokens, userAiKeys } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { listMcpKeys } from "@/lib/mcp-keys";
import { aiProviderOptions } from "@/lib/ai-providers";
import { McpKeysSection } from "@/components/dashboard/api-keys/mcp-keys-section";
import { UploadTokensSection } from "@/components/dashboard/api-keys/upload-tokens-section";
import { AiKeySection } from "@/components/dashboard/api-keys/ai-key-section";

export const runtime = "nodejs";

/**
 * The single place every credential is managed.
 *
 * Before this page there were three: MCP keys were buried inside
 * /dashboard/settings/account between "Export my data" and "Delete account",
 * upload tokens lived at /dashboard/settings/tokens, and the BYO provider key
 * at /dashboard/settings/ai-key with its own sidebar slot. Nothing linked them
 * even though they answer the same question - "what can talk to my account, and
 * with what". The old routes now redirect here (next.config.ts).
 *
 * Everything is loaded server-side and handed to client sections; the sections
 * own the flows (create, rename, revoke, verify) and their feedback. Lists are
 * serialised to ISO strings at this boundary because a Date does not survive
 * the RSC payload as a Date.
 */
export default async function ApiKeysPage() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/api-keys");
  const userId = session.user.id;

  const [plan, mcpKeys, tokens, aiRows, providers] = await Promise.all([
    getPlan(userId),
    listMcpKeys(userId),
    db
      .select({
        id: uploadTokens.id,
        label: uploadTokens.label,
        createdAt: uploadTokens.createdAt,
        lastUsedAt: uploadTokens.lastUsedAt,
      })
      .from(uploadTokens)
      .where(and(eq(uploadTokens.userId, userId), isNull(uploadTokens.revokedAt)))
      .orderBy(desc(uploadTokens.createdAt)),
    db
      .select({ provider: userAiKeys.provider, model: userAiKeys.model, updatedAt: userAiKeys.updatedAt })
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, userId))
      .limit(1),
    aiProviderOptions(),
  ]);

  const saved = aiRows[0]
    ? {
        provider: aiRows[0].provider,
        model: aiRows[0].model,
        updatedAt: aiRows[0].updatedAt.toISOString(),
      }
    : null;

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header>
        <h1 className="text-xl font-medium text-foreground">API keys &amp; MCP</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Every credential tied to your account. Secrets are shown once at creation and stored
          hashed or encrypted, so nothing here can be read back: if you lose one, revoke it and
          issue another.
        </p>
      </header>

      <McpKeysSection
        keys={mcpKeys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        }))}
      />

      <UploadTokensSection
        tokens={tokens.map((t) => ({
          id: t.id,
          label: t.label,
          createdAt: t.createdAt.toISOString(),
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        }))}
      />

      <AiKeySection providers={providers} saved={saved} plan={plan} />
    </div>
  );
}
