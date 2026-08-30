import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { uploadTokens, userAiKeys } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { formatDate } from "@/lib/format";
import { McpKeysCard } from "@/components/dashboard/mcp-keys-card";
import { generateToken, revokeToken, saveAiKeyAction, removeAiKeyAction } from "./actions";

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
 */
export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ issued?: string }>;
}) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/api-keys");
  const { issued } = await searchParams;
  const plan = await getPlan(session.user.id);

  const [tokens, [aiKey]] = await Promise.all([
    db
      .select({
        id: uploadTokens.id,
        label: uploadTokens.label,
        createdAt: uploadTokens.createdAt,
        lastUsedAt: uploadTokens.lastUsedAt,
      })
      .from(uploadTokens)
      .where(and(eq(uploadTokens.userId, session.user.id), isNull(uploadTokens.revokedAt)))
      .orderBy(desc(uploadTokens.createdAt)),
    db
      .select({ provider: userAiKeys.provider, model: userAiKeys.model, updatedAt: userAiKeys.updatedAt })
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, session.user.id))
      .limit(1),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header>
        <h1 className="text-xl font-medium text-foreground">API keys &amp; MCP</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Every credential tied to your account. Keys are shown once at creation and stored
          hashed or encrypted; if you lose one, revoke it and issue another.
        </p>
      </header>

      {/* Client component, unchanged: it talks to /api/mcp-keys, which is also
          used by non-browser callers, so it stays a fetch client rather than
          being rewritten onto this page's server actions. */}
      <McpKeysCard />

      <UploadTokens tokens={tokens} issued={issued} />

      <AiProviderKey row={aiKey ?? null} plan={plan} />
    </div>
  );
}

type TokenRow = {
  id: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

function UploadTokens({ tokens, issued }: { tokens: TokenRow[]; issued?: string }) {
  return (
    <section className="rounded-[18px] border border-border/60 p-5">
      <h2 className="text-sm font-medium text-foreground">Upload tokens</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Used by the <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">pseolint upload</code>{" "}
        CLI command and your GitHub Action, to push audit results here for cross-run history and
        regression trends.
      </p>

      {issued && (
        <div className="mt-4 rounded-[12px] border border-success/40 bg-success/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-success">
            New token (copy now; you won&apos;t see it again)
          </p>
          <pre className="mt-2 overflow-x-auto rounded-[8px] bg-background p-2 font-mono text-[11px] text-foreground">
            {issued}
          </pre>
        </div>
      )}

      <form
        action={async (fd) => {
          "use server";
          const out = await generateToken(String(fd.get("label")));
          redirect(`/dashboard/api-keys?issued=${encodeURIComponent(out.token)}`);
        }}
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Label</span>
          <input
            name="label"
            required
            placeholder="e.g. github-actions"
            className="rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-[14px] bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Generate
        </button>
      </form>

      {tokens.length === 0 ? (
        <p className="mt-4 rounded-[12px] border border-dashed border-border/60 p-5 text-center text-xs text-muted-foreground">
          No upload tokens yet. Generate one to start uploading audit results from CI or the CLI.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[10px] border border-border/50 bg-card/30 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs text-foreground">{t.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  created {formatDate(t.createdAt)}
                  {t.lastUsedAt ? ` · last used ${formatDate(t.lastUsedAt)}` : " · never used"}
                </p>
              </div>
              <form
                action={async () => {
                  "use server";
                  await revokeToken(t.id);
                }}
              >
                <button type="submit" className="text-xs text-destructive underline hover:no-underline">
                  Revoke
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AiProviderKey({
  row,
  plan,
}: {
  row: { provider: string; model: string | null; updatedAt: Date } | null;
  plan: "free" | "pro";
}) {
  return (
    <section className="rounded-[18px] border border-border/60 p-5">
      <h2 className="text-sm font-medium text-foreground">AI provider key</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {plan === "free"
          ? "Free tier uses your own LLM key for triage; you pay the provider directly, no quotas from us. Audits without a key still produce rule-based findings, but the AI-written remediation steps are skipped."
          : "Pro includes managed AI triage (we pay the LLM bill). Swap in your own key to bypass our managed quotas and pay the provider directly: unlimited triage on any tier."}
      </p>

      {row ? (
        <div className="mt-4 rounded-[12px] border border-primary/30 bg-primary/5 p-4">
          <dl className="grid grid-cols-[minmax(0,88px)_minmax(0,1fr)] gap-y-2 text-xs">
            <dt className="text-muted-foreground">Provider</dt>
            <dd className="font-mono text-foreground">{row.provider}</dd>
            {row.model && (
              <>
                <dt className="text-muted-foreground">Model</dt>
                <dd className="break-all font-mono text-foreground">{row.model}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Key</dt>
            <dd className="font-mono text-foreground">•••••••••••• (encrypted)</dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd className="text-foreground">{formatDate(row.updatedAt)}</dd>
          </dl>
          <form action={removeAiKeyAction} className="mt-4">
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-[14px] border border-destructive/50 px-3 text-xs text-destructive hover:bg-destructive/10"
            >
              Remove key
            </button>
          </form>
        </div>
      ) : (
        <form action={saveAiKeyAction} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-foreground">Provider</span>
            <select
              name="provider"
              required
              defaultValue="anthropic"
              className="rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
              <option value="ollama">Ollama (self-hosted)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-foreground">API key</span>
            <input
              name="apiKey"
              type="password"
              required
              minLength={8}
              className="rounded-[10px] border border-border-strong bg-background px-3 py-2 font-mono text-sm"
            />
            <span className="text-[11px] text-muted-foreground">
              Stored encrypted at rest (AES-256-GCM). We never echo it back to the browser.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-foreground">
              Model <span className="text-muted-foreground">(optional)</span>
            </span>
            <input
              name="model"
              placeholder="claude-sonnet-4-6"
              className="rounded-[10px] border border-border-strong bg-background px-3 py-2 font-mono text-sm"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-9 w-fit items-center rounded-[14px] bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
        </form>
      )}
    </section>
  );
}
