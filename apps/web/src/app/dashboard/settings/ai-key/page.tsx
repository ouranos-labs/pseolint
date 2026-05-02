import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAiKeys } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { saveAiKeyAction, removeAiKeyAction } from "./actions";

export default async function AiKeySettings() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  const plan = await getPlan(session.user.id);

  const [row] = await db
    .select({ provider: userAiKeys.provider, model: userAiKeys.model, updatedAt: userAiKeys.updatedAt })
    .from(userAiKeys)
    .where(eq(userAiKeys.userId, session.user.id))
    .limit(1);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-xl font-medium">Bring your own AI key</h1>
      {plan === "free" ? (
        <p className="text-sm text-muted-foreground">
          Free tier uses your own LLM key for triage — you pay the provider directly, no quotas
          from us. Add an Anthropic / OpenAI / Google / Ollama key below. Audits without a key
          still produce rule-based findings, but the AI-written remediation steps are skipped.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Pro includes managed AI triage (we pay the LLM bill). You can swap in your own
          Anthropic / OpenAI / Google key to bypass our managed quotas and pay the provider
          directly — unlimited triage on any tier.
        </p>
      )}

      {row ? (
        <div className="rounded-[18px] border border-primary/30 bg-primary/5 p-5">
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Provider</dt>
            <dd className="font-mono text-foreground">{row.provider}</dd>
            {row.model && (
              <>
                <dt className="text-muted-foreground">Model</dt>
                <dd className="font-mono text-foreground">{row.model}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Key</dt>
            <dd className="font-mono text-foreground">•••••••••••• (stored encrypted)</dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd className="text-foreground">{new Date(row.updatedAt).toLocaleDateString()}</dd>
          </dl>
          <form action={removeAiKeyAction} className="mt-4">
            <button type="submit" className="inline-flex h-9 items-center rounded-[14px] border border-destructive/50 px-3 text-xs text-destructive hover:bg-destructive/10">
              Remove key
            </button>
          </form>
        </div>
      ) : (
        <form action={saveAiKeyAction} className="flex flex-col gap-4 rounded-[18px] border border-border/60 p-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Provider</span>
            <select name="provider" required defaultValue="anthropic" className="rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm">
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
              <option value="ollama">Ollama (self-hosted)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">API key</span>
            <input name="apiKey" type="password" required minLength={8} className="rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm font-mono" />
            <span className="text-xs text-muted-foreground">Stored encrypted at rest (AES-256-GCM). We never echo it back to the browser.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Model <span className="text-muted-foreground">(optional)</span></span>
            <input name="model" placeholder="claude-sonnet-4-6" className="rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm font-mono" />
          </label>
          <button type="submit" className="inline-flex h-10 w-fit items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Save
          </button>
        </form>
      )}
    </div>
  );
}
