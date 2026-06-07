"use client";

import { useEffect, useState, useCallback } from "react";

interface KeySummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const ENDPOINT = "https://pseolint.dev/mcp";

export function McpKeysCard() {
  const [keys, setKeys] = useState<KeySummary[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/mcp-keys");
    if (res.ok) setKeys((await res.json()).keys ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createKey() {
    setBusy(true);
    try {
      const res = await fetch("/api/mcp-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "MCP key" }),
      });
      if (res.ok) {
        setNewToken((await res.json()).token);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch("/api/mcp-keys", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await refresh();
  }

  return (
    <div className="rounded-[18px] border border-border/60 p-5">
      <h2 className="text-sm font-medium text-foreground">MCP access keys</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Connect Claude, Cursor, or any MCP client to{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{ENDPOINT}</code>.
        Anonymous use is rate-limited; a key raises your limits and (soon) unlocks the orchestrate tool.
      </p>

      {newToken && (
        <div className="mt-4 rounded-[12px] border border-border/60 bg-muted/40 p-4">
          <p className="text-xs font-medium text-foreground">
            Copy this token now — it won&apos;t be shown again:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-[8px] bg-background p-2 font-mono text-[11px] text-foreground">
            {newToken}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">Client config:</p>
          <pre className="mt-1 overflow-x-auto rounded-[8px] bg-background p-2 font-mono text-[11px] text-foreground">
            {JSON.stringify(
              { url: ENDPOINT, headers: { Authorization: `Bearer ${newToken}` } },
              null,
              2,
            )}
          </pre>
        </div>
      )}

      <button
        type="button"
        onClick={createKey}
        disabled={busy}
        className="mt-4 inline-flex h-9 items-center rounded-[14px] border border-border-strong px-3 text-xs font-medium hover:bg-secondary disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create key"}
      </button>

      {keys.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between rounded-[10px] border border-border/50 bg-card/30 px-3 py-2"
            >
              <span className="text-xs text-foreground">
                <code className="font-mono">pseo_{k.prefix}…</code>
                <span className="ml-2 text-muted-foreground">{k.name}</span>
              </span>
              <button
                type="button"
                onClick={() => revoke(k.id)}
                className="text-xs text-destructive underline hover:no-underline"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
