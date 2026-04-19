"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void }) => void } }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    const iv = setInterval(() => {
      if (window.turnstile) {
        const el = document.getElementById("turnstile-widget");
        if (el && el.childElementCount === 0) {
          window.turnstile.render(el, { sitekey: siteKey, callback: setToken });
          clearInterval(iv);
        }
      }
    }, 100);
    return () => clearInterval(iv);
  }, [siteKey]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { setErr("Complete the bot check first."); return; }
    setSubmitting(true); setErr(null);
    const res = await fetch("/api/audits", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, turnstileToken: token }),
    });
    if (res.ok) { const { auditId } = await res.json(); router.push(`/a/${auditId}`); }
    else { const { error } = await res.json().catch(() => ({ error: "Unknown error" })); setErr(error); setSubmitting(false); }
  };

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <main className="container mx-auto max-w-2xl px-4 py-24">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          SpamBrain-proof your pSEO <span className="text-muted-foreground">before you publish.</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Paste your site's URL. In 60 seconds, a shareable report across 35 SpamBrain-risk rules.
          Free, no signup for your first audit.
        </p>
        <form onSubmit={submit} className="mt-10 space-y-3">
          <Input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yoursite.com" className="h-12 font-mono text-base" />
          <div id="turnstile-widget" className="min-h-[65px]" />
          <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={submitting}>
            {submitting ? "Starting audit…" : "Audit my site"}
          </Button>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </form>
      </main>
    </>
  );
}
