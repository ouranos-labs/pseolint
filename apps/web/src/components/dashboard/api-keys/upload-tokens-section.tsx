"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createUploadTokenAction,
  revokeUploadTokenAction,
} from "@/app/dashboard/api-keys/actions";
import { formatDate } from "@/lib/format";
import {
  BTN_PRIMARY,
  ConfirmButton,
  CopyButton,
  EmptyState,
  FIELD,
  KeyRow,
  OneTimeSecret,
  Section,
} from "./ui";

export type UploadToken = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function UploadTokensSection({ tokens }: { tokens: UploadToken[] }) {
  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    start(async () => {
      const res = await createUploadTokenAction(label);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setIssued(res.token);
      setLabel("");
      toast.success("Upload token created. Copy it now.");
    });
  }

  return (
    <Section
      title="Upload tokens"
      blurb={
        <>
          Used by <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">pseolint upload</code>{" "}
          and your GitHub Action to push audit results here for cross-run history and regression
          trends. Give each CI environment its own token so you can revoke one without breaking the
          rest.
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); create(); }
            }}
            maxLength={100}
            placeholder="e.g. github-actions"
            className={FIELD}
          />
        </label>
        <button type="button" onClick={create} disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Generating…" : "Generate"}
        </button>
      </div>

      {issued && (
        <OneTimeSecret token={issued} onDismiss={() => setIssued(null)}>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Store it as a CI secret named{" "}
            <code className="font-mono text-foreground">PSEOLINT_TOKEN</code>, then:
          </p>
          <div className="mt-1 flex items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-[8px] bg-background p-2 font-mono text-[11px] text-foreground">
              {CI_SNIPPET}
            </pre>
            <CopyButton value={CI_SNIPPET} />
          </div>
        </OneTimeSecret>
      )}

      {tokens.length === 0 ? (
        <EmptyState>
          No upload tokens yet. Generate one to start uploading audit results from CI or the CLI.
        </EmptyState>
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {tokens.map((t) => (
            <KeyRow key={t.id}>
              <div className="min-w-0">
                <p className="truncate text-xs text-foreground">{t.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  created {formatDate(new Date(t.createdAt))}
                  {t.lastUsedAt ? ` · last used ${formatDate(new Date(t.lastUsedAt))}` : " · never used"}
                </p>
              </div>
              <ConfirmButton
                confirmLabel="Revoke it"
                onConfirm={async () => {
                  const res = await revokeUploadTokenAction(t.id);
                  if (res.ok) toast.success("Token revoked. Uploads using it will now be rejected.");
                  else toast.error(res.error);
                }}
              >
                Revoke
              </ConfirmButton>
            </KeyRow>
          ))}
        </ul>
      )}
    </Section>
  );
}

const CI_SNIPPET = `- run: npx pseolint audit ./out --format json --out report.json
- run: npx pseolint upload report.json --token \${{ secrets.PSEOLINT_TOKEN }} --domain-id <id>`;
