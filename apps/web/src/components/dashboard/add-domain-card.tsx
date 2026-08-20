"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDomainAction } from "@/app/dashboard/domain-actions";
import { normalizeUserUrl } from "@/lib/normalize-url";

export function AddDomainCard({ variant = "hero" }: { variant?: "hero" | "compact" }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await addDomainAction(url);
      if (!res.ok) { setErr(res.error); return; }
      // Verified domains start auditing immediately: route through /a/{auditId}
      // so the user watches the live run, which auto-redirects to /r/{slug} on
      // completion (same flow as free tier). Unverified ones have no audit yet:
      // send them to the workspace, where the verify banner is.
      router.push(res.auditId ? `/a/${res.auditId}` : `/dashboard/${encodeURIComponent(res.host)}`);
    });
  }

  if (variant === "compact") {
    return (
      <form onSubmit={submit} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
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
          className="w-full sm:w-64"
        />
        <Button type="submit" disabled={pending || !url} className="w-full sm:w-auto">
          {pending ? "Adding…" : "+ Add domain"}
        </Button>
        {err && <span className="self-start text-xs text-destructive sm:ml-2 sm:self-center">{err}</span>}
      </form>
    );
  }

  return (
    <section className="rounded-[28px] border border-border/70 bg-card/40 p-6 text-center backdrop-blur-sm sm:p-8">
      <h2 className="text-xl font-medium text-foreground">Add your first domain</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Confirm ownership with a DNS record or Search Console, then we run a full
        audit and check daily for changes.
      </p>
      <form onSubmit={submit} className="mx-auto mt-6 flex max-w-xl flex-col gap-2 sm:flex-row">
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
        <Button type="submit" disabled={pending || !url} className="sm:w-auto">
          {pending ? "Starting audit…" : "Start monitoring →"}
        </Button>
      </form>
      {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
    </section>
  );
}
