"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuditForm() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/audits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, turnstileToken: "dev-skip" }),
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
    <form onSubmit={submit} className="flex w-full gap-2">
      <Input
        type="url"
        required
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="flex-1"
      />
      <Button type="submit" disabled={loading || !url}>
        {loading ? "Starting…" : "Run audit"}
      </Button>
      {error && <span className="ml-3 self-center text-xs text-destructive">{error}</span>}
    </form>
  );
}
