"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import {
  createMcpKeyAction,
  renameMcpKeyAction,
  revokeMcpKeyAction,
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

export type McpKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const ENDPOINT = "https://pseolint.dev/mcp";

/**
 * Setup for every MCP client that matters, split by what the client can do
 * rather than by vendor. Clients with native remote support take the URL and an
 * Authorization header; stdio-only clients need the `mcp-remote` bridge, which
 * passes the header through as a CLI flag.
 *
 * `TOKEN` is substituted with a real key when one was just created, so the
 * snippet is paste-ready in the only moment the plaintext exists.
 */
const CLIENTS = [
  {
    id: "claude-code",
    label: "Claude Code",
    lang: "bash",
    snippet: (t: string) => `claude mcp add --transport http pseolint ${ENDPOINT} \\\n  --header "Authorization: Bearer ${t}"`,
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    lang: "json",
    snippet: (t: string) =>
      JSON.stringify(
        {
          mcpServers: {
            pseolint: {
              command: "npx",
              args: ["-y", "mcp-remote", ENDPOINT, "--header", `Authorization: Bearer ${t}`],
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: "cursor",
    label: "Cursor",
    lang: "json",
    snippet: (t: string) =>
      JSON.stringify(
        { mcpServers: { pseolint: { url: ENDPOINT, headers: { Authorization: `Bearer ${t}` } } } },
        null,
        2,
      ),
  },
  {
    id: "vscode",
    label: "VS Code",
    lang: "json",
    snippet: (t: string) =>
      JSON.stringify(
        { servers: { pseolint: { type: "http", url: ENDPOINT, headers: { Authorization: `Bearer ${t}` } } } },
        null,
        2,
      ),
  },
  {
    id: "windsurf",
    label: "Windsurf",
    lang: "json",
    snippet: (t: string) =>
      JSON.stringify(
        { mcpServers: { pseolint: { serverUrl: ENDPOINT, headers: { Authorization: `Bearer ${t}` } } } },
        null,
        2,
      ),
  },
  {
    id: "zed",
    label: "Zed",
    lang: "json",
    snippet: (t: string) =>
      JSON.stringify(
        {
          context_servers: {
            pseolint: {
              command: { path: "npx", args: ["-y", "mcp-remote", ENDPOINT, "--header", `Authorization: Bearer ${t}`] },
            },
          },
        },
        null,
        2,
      ),
  },
] as const;

const TOKEN_PLACEHOLDER = "YOUR_KEY";

export function McpKeysSection({ keys }: { keys: McpKey[] }) {
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { track } = useAnalytics();

  function create() {
    start(async () => {
      const res = await createMcpKeyAction(name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setIssued(res.token);
      setName("");
      track({ name: "mcp_key_created" });
      toast.success("MCP key created. Copy it now.");
    });
  }

  return (
    <Section
      title="MCP access keys"
      blurb={
        <>
          Connect Claude, Cursor, VS Code, or any MCP client to{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{ENDPOINT}</code>. Anonymous
          use is rate-limited; a key raises your limits and adds the tools that read your own audits
          (<code className="font-mono text-[11px]">pseolint_list_audits</code>,{" "}
          <code className="font-mono text-[11px]">pseolint_get_audit</code>).
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); create(); }
            }}
            maxLength={100}
            placeholder="e.g. laptop-cursor"
            className={FIELD}
          />
        </label>
        <button type="button" onClick={create} disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Creating…" : "Create key"}
        </button>
      </div>

      {issued && (
        <OneTimeSecret token={issued} onDismiss={() => setIssued(null)}>
          <ClientSetup token={issued} />
        </OneTimeSecret>
      )}

      {keys.length === 0 ? (
        <EmptyState>
          No MCP keys yet. Create one to connect an assistant to your audits.
        </EmptyState>
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {keys.map((k) => (
            <McpKeyItem key={k.id} k={k} />
          ))}
        </ul>
      )}

      {!issued && (
        <details className="group mt-4 rounded-[12px] border border-border/60">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="inline-block transition-transform group-open:rotate-90">›</span> Client setup
            snippets
          </summary>
          <div className="border-t border-border/60 px-3 py-3">
            <ClientSetup token={TOKEN_PLACEHOLDER} />
          </div>
        </details>
      )}
    </Section>
  );
}

function McpKeyItem({ k }: { k: McpKey }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(k.name);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await renameMcpKeyAction(k.id, draft);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setEditing(false);
      toast.success("Renamed.");
    });
  }

  return (
    <KeyRow>
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") { setDraft(k.name); setEditing(false); }
            }}
            maxLength={100}
            className={`${FIELD} py-1 text-xs`}
          />
          <button type="button" onClick={save} disabled={pending} className={BTN_PRIMARY}>
            {pending ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => { setDraft(k.name); setEditing(false); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div className="min-w-0">
            <p className="truncate text-xs text-foreground">
              <code className="font-mono">pseo_{k.prefix}…</code>
              <span className="ml-2 text-muted-foreground">{k.name}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              created {formatDate(new Date(k.createdAt))}
              {k.lastUsedAt ? ` · last used ${formatDate(new Date(k.lastUsedAt))}` : " · never used"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Rename
            </button>
            <ConfirmButton
              confirmLabel="Revoke it"
              onConfirm={async () => {
                const res = await revokeMcpKeyAction(k.id);
                if (res.ok) toast.success("Key revoked. Clients using it will stop working.");
                else toast.error(res.error);
              }}
            >
              Revoke
            </ConfirmButton>
          </div>
        </>
      )}
    </KeyRow>
  );
}

function ClientSetup({ token }: { token: string }) {
  const [active, setActive] = useState<string>(CLIENTS[0].id);
  const client = CLIENTS.find((c) => c.id === active) ?? CLIENTS[0];
  const snippet = client.snippet(token);
  return (
    <div className="mt-3">
      <div
        role="tablist"
        aria-label="MCP client"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
      >
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            role="tab"
            type="button"
            aria-selected={c.id === active}
            onClick={() => setActive(c.id)}
            className={`inline-flex shrink-0 items-center rounded-[10px] px-2.5 py-1 text-[11px] transition-colors ${
              c.id === active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-start gap-2">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-[8px] bg-background p-2 font-mono text-[11px] text-foreground">
          {snippet}
        </pre>
        <CopyButton value={snippet} />
      </div>
      {token === TOKEN_PLACEHOLDER && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Replace <code className="font-mono">{TOKEN_PLACEHOLDER}</code> with a key. Existing keys
          cannot be re-read, so create a new one if you no longer have it.
        </p>
      )}
    </div>
  );
}
