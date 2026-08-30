"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  removeAiKeyAction,
  saveAiKeyAction,
  testAiKeyAction,
} from "@/app/dashboard/api-keys/actions";
import { formatDate } from "@/lib/format";
import { BTN_GHOST, BTN_PRIMARY, ConfirmButton, FIELD, Section } from "./ui";

export type ProviderOption = {
  id: string;
  label: string;
  family?: string;
  consoleUrl?: string;
  keyPrefix?: string;
  defaultModel: string;
  needsKey: boolean;
  installed: boolean;
};

export type SavedAiKey = {
  provider: string;
  model: string | null;
  updatedAt: string;
};

export function AiKeySection({
  providers,
  saved,
  plan,
}: {
  providers: ProviderOption[];
  saved: SavedAiKey | null;
  plan: "free" | "pro";
}) {
  // Editing is a separate state from "no key saved" so a user can change
  // provider or rotate a key in place. Previously the form only existed when
  // there was no row, so rotating meant deleting first and running with no key
  // in between.
  const [editing, setEditing] = useState(saved === null);

  return (
    <Section
      title="AI provider key"
      blurb={
        plan === "free"
          ? "Free tier uses your own LLM key for triage; you pay the provider directly, with no quotas from us. Audits without a key still produce rule-based findings, but the AI-written remediation steps are skipped."
          : "Pro includes managed AI triage (we pay the LLM bill). Swap in your own key to bypass our managed quotas and pay the provider directly: unlimited triage on any tier."
      }
    >
      {saved && !editing ? (
        <SavedKey saved={saved} providers={providers} onEdit={() => setEditing(true)} />
      ) : (
        <KeyForm
          providers={providers}
          saved={saved}
          onDone={() => setEditing(false)}
          onCancel={saved ? () => setEditing(false) : undefined}
        />
      )}
    </Section>
  );
}

function SavedKey({
  saved,
  providers,
  onEdit,
}: {
  saved: SavedAiKey;
  providers: ProviderOption[];
  onEdit: () => void;
}) {
  const p = providers.find((x) => x.id === saved.provider);
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="mt-4 rounded-[12px] border border-primary/30 bg-primary/5 p-4">
      <dl className="grid grid-cols-[minmax(0,88px)_minmax(0,1fr)] gap-y-2 text-xs">
        <dt className="text-muted-foreground">Provider</dt>
        <dd className="font-mono text-foreground">
          {p?.label ?? saved.provider}
          {p && !p.installed && (
            <span className="ml-2 font-sans text-destructive">not available on this deployment</span>
          )}
        </dd>
        <dt className="text-muted-foreground">Model</dt>
        <dd className="break-all font-mono text-foreground">
          {saved.model ?? `${p?.defaultModel ?? "default"} (default)`}
        </dd>
        {p?.needsKey !== false && (
          <>
            <dt className="text-muted-foreground">Key</dt>
            <dd className="font-mono text-foreground">•••••••••••• (encrypted)</dd>
          </>
        )}
        <dt className="text-muted-foreground">Updated</dt>
        <dd className="text-foreground">{formatDate(new Date(saved.updatedAt))}</dd>
      </dl>

      {checked && (
        <p className={`mt-3 text-xs ${checked.ok ? "text-success" : "text-destructive"}`}>
          {checked.ok ? "✓ " : "✗ "}
          {checked.text}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className={BTN_GHOST}
          onClick={() =>
            start(async () => {
              setChecked(null);
              const res = await testAiKeyAction();
              if (res.ok) {
                setChecked({ ok: true, text: `Reachable · ${res.modelId}` });
                toast.success("Key works.");
              } else {
                setChecked({ ok: false, text: res.error });
                toast.error("Key check failed.");
              }
            })
          }
        >
          {pending ? "Testing…" : "Test key"}
        </button>
        <button type="button" onClick={onEdit} className={BTN_GHOST}>
          Replace
        </button>
        <ConfirmButton
          confirmLabel="Remove it"
          onConfirm={async () => {
            const res = await removeAiKeyAction();
            if (res.ok) toast.success("Key removed. Triage will fall back to the default.");
            else toast.error(res.error);
          }}
        >
          Remove
        </ConfirmButton>
      </div>
    </div>
  );
}

function KeyForm({
  providers,
  saved,
  onDone,
  onCancel,
}: {
  providers: ProviderOption[];
  saved: SavedAiKey | null;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const first = providers.find((p) => p.installed) ?? providers[0];
  const [providerId, setProviderId] = useState(saved?.provider ?? first?.id ?? "anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(saved?.model ?? "");
  const [endpoint, setEndpoint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const provider = providers.find((p) => p.id === providerId);
  const needsKey = provider?.needsKey !== false;
  // A prefix mismatch is a warning, never a block: vendors add key formats
  // faster than we can track them, and refusing a valid key is worse than
  // showing a hint that turns out to be wrong.
  const prefixWarning =
    needsKey && provider?.keyPrefix && apiKey.length > 4 && !apiKey.startsWith(provider.keyPrefix)
      ? `${provider.label} keys usually start with "${provider.keyPrefix}". Double-check you pasted the right one.`
      : null;

  function submit() {
    start(async () => {
      setError(null);
      const res = await saveAiKeyAction({ provider: providerId, apiKey, model, endpoint });
      if (!res.ok) {
        setError(res.error);
        toast.error("Key not saved.");
        return;
      }
      setApiKey("");
      toast.success(`Verified and saved · ${res.modelId}`);
      onDone();
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-foreground">Provider</span>
        <select
          value={providerId}
          onChange={(e) => { setProviderId(e.target.value); setError(null); }}
          className={FIELD}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.installed}>
              {p.label}
              {p.family ? ` · ${p.family}` : ""}
              {p.installed ? "" : " (unavailable)"}
            </option>
          ))}
        </select>
        {provider?.consoleUrl && (
          <span className="text-[11px] text-muted-foreground">
            {needsKey ? "Get a key at " : "Install from "}
            <a
              href={provider.consoleUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline-offset-4 hover:underline"
            >
              {new URL(provider.consoleUrl).host}
            </a>
          </span>
        )}
      </label>

      {needsKey ? (
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-foreground">API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setError(null); }}
            autoComplete="off"
            spellCheck={false}
            placeholder={saved ? "Paste a new key to replace the stored one" : undefined}
            className={`${FIELD} font-mono`}
          />
          <span className="text-[11px] text-muted-foreground">
            Verified with the provider before it is stored, then encrypted at rest (AES-256-GCM).
            We never echo it back to the browser.
          </span>
          {prefixWarning && <span className="text-[11px] text-warning">{prefixWarning}</span>}
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-foreground">Endpoint</span>
          <input
            value={endpoint}
            onChange={(e) => { setEndpoint(e.target.value); setError(null); }}
            placeholder="http://localhost:11434"
            className={`${FIELD} font-mono`}
          />
          <span className="text-[11px] text-muted-foreground">
            Must be reachable from our servers, so localhost only works for local runs of the CLI,
            not for audits run here.
          </span>
        </label>
      )}

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-foreground">
          Model <span className="text-muted-foreground">(optional)</span>
        </span>
        <input
          value={model}
          onChange={(e) => { setModel(e.target.value); setError(null); }}
          placeholder={provider?.defaultModel}
          spellCheck={false}
          className={`${FIELD} font-mono`}
        />
        <span className="text-[11px] text-muted-foreground">
          Leave blank for {provider?.defaultModel ?? "the provider default"}.
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-[10px] border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || (needsKey && apiKey.trim().length < 8) || !provider?.installed}
          className={BTN_PRIMARY}
        >
          {pending ? "Verifying…" : saved ? "Verify & replace" : "Verify & save"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={BTN_GHOST}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
