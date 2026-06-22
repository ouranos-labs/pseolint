"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeUserUrl } from "@/lib/normalize-url";

export function AuditForm() {
  const [url, setUrl] = useState("");
  const [render, setRender] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/audits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, turnstileToken: "dev-skip", render }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? `Failed (${res.status})`);
      setLoading(false);
      return;
    }
    const { auditId, reportUrl, cached } = await res.json() as { auditId: string; reportUrl?: string; cached?: boolean };
    window.location.assign(cached && reportUrl ? reportUrl : `/a/${auditId}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex w-full gap-2">
        <Input
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          placeholder="example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => { const n = normalizeUserUrl(url); if (n) setUrl(n); }}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !url}>
          {loading ? "Starting…" : "Run audit"}
        </Button>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={render}
          onChange={(e) => setRender(e.target.checked)}
          className="h-3.5 w-3.5 accent-primary"
        />
        <span>
          Rendered mode (Pro) — JS-heavy sites (Webflow, Framer, React SPAs).
          Slower but catches rendered content. Free audits run static even if
          this is ticked.
        </span>
      </label>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  );
}
