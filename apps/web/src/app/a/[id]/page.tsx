"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [status, setStatus] = useState("queued");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/audits/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setStatus(json.status);
        if (json.status === "completed") { router.replace(`/r/${id}`); return; }
        if (json.status === "failed") { setErr(json.errorMessage ?? "Audit failed"); return; }
      } catch (e) { setErr((e as Error).message); }
      if (!stopped) setTimeout(tick, 2000);
    };
    tick();
    return () => { stopped = true; };
  }, [id, router]);

  return (
    <main className="container mx-auto max-w-xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Running audit <Badge variant="secondary" className="font-mono">{status}</Badge>
          </CardTitle>
          <CardDescription>This usually takes 30–120 seconds. You can leave this page open.</CardDescription>
        </CardHeader>
        <CardContent>
          {err && <p className="text-sm text-destructive">Error: {err}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
