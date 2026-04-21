"use client";
import { useState, useTransition } from "react";
import { addMonitoredDomain } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddDomainForm() {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const res = await addMonitoredDomain(url);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setUrl("");
    });
  };

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row">
      <Input
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://yoursite.com"
        className="h-11 flex-1"
      />
      <Button type="submit" disabled={pending} className="h-11 font-semibold sm:w-44">
        {pending ? "Adding…" : "Monitor domain"}
      </Button>
      {err && <p className="sm:basis-full text-sm text-destructive">{err}</p>}
    </form>
  );
}
