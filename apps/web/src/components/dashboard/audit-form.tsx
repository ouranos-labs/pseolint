"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeUserUrl } from "@/lib/normalize-url";
import { AuditErrorNotice } from "@/components/audit/audit-error-notice";
import { submitAudit } from "@/lib/audit-submit";
import { invalidUrlView, type AuditErrorView } from "@/lib/audit-errors";

export function AuditForm() {
  const [url, setUrl] = useState("");
  const [render, setRender] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AuditErrorView | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeUserUrl(url);
    if (!normalized) {
      setError(invalidUrlView());
      return;
    }
    setLoading(true);
    setError(null);
    // Signed-in, verified callers skip Turnstile server-side; the placeholder
    // token only satisfies the body schema.
    const result = await submitAudit(
      { url: normalized, turnstileToken: "dev-skip", render },
      { returnTo: "/dashboard" },
    );
    if (result.ok) {
      window.location.assign(result.next);
      return;
    }
    setError(result.view);
    setLoading(false);
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
          placeholder="yoursite.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => { const n = normalizeUserUrl(url); if (n) setUrl(n); }}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !url || error?.cooldownUntil != null}>
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
          Rendered mode (Pro): JS-heavy sites (Webflow, Framer, React SPAs).
          Slower but catches rendered content. Free audits run static even if
          this is ticked.
        </span>
      </label>
      {error && <AuditErrorNotice view={error} onCooldownEnd={() => setError(null)} className="text-xs" />}
    </form>
  );
}
