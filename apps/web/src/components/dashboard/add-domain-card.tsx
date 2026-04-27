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
      // Route through /a/{auditId} so the user watches the live audit; that page
      // auto-redirects to /r/{slug} on completion. Same flow as free tier.
      router.push(`/a/${res.auditId}`);
    });
  }

  if (variant === "compact") {
    return (
      <form onSubmit={submit} className="flex gap-2">
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
          className="w-64"
        />
        <Button type="submit" disabled={pending || !url}>
          {pending ? "Adding…" : "+ Add domain"}
        </Button>
        {err && <span className="ml-2 self-center text-xs text-destructive">{err}</span>}
      </form>
    );
  }

  return (
    <section className="rounded-[28px] border border-border/70 bg-card/40 p-8 text-center backdrop-blur-sm">
      <h2 className="text-xl font-medium text-foreground">Add your first domain</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        We&apos;ll run a full audit immediately, then check daily for changes.
      </p>
      <form onSubmit={submit} className="mx-auto mt-6 flex max-w-xl gap-2">
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
        <Button type="submit" disabled={pending || !url}>
          {pending ? "Starting audit…" : "Start monitoring →"}
        </Button>
      </form>
      {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
    </section>
  );
}
