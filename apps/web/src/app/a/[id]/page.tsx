"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScanningTiles } from "@/components/audit/scanning-tiles";

type Status = "queued" | "running" | "completed" | "failed" | string;

const STEPS: { key: Status; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "running", label: "Crawling + scoring" },
  { key: "completed", label: "Report ready" },
];

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [status, setStatus] = useState<Status>("queued");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const start = Date.now();
    const clockId = setInterval(
      () => setElapsed(Math.round((Date.now() - start) / 1000)),
      500,
    );
    return () => clearInterval(clockId);
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/audits/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setStatus(json.status);
        if (typeof json.sourceUrl === "string") setSourceUrl(json.sourceUrl);
        if (json.status === "completed") {
          router.replace(`/r/${json.slug ?? id}`);
          return;
        }
        if (json.status === "failed") {
          setErr(json.errorMessage ?? "Audit failed");
          return;
        }
      } catch (e) {
        setErr((e as Error).message);
      }
      if (!stopped) setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stopped = true;
    };
  }, [id, router]);

  const activeIndex = STEPS.findIndex((s) => s.key === status);
  const host = hostOf(sourceUrl);

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            err ? "bg-destructive" : "animate-pulse bg-primary"
          }`}
        />
        {err ? "Audit failed" : "Running audit"}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
        <h1
          className="text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          {host ?? "Preparing crawl…"}
        </h1>
        <span className="font-mono text-xs text-muted-foreground">audit · {id.slice(0, 8)}</span>
      </div>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        Crawling up to 200 pages, classifying templates, scoring against 35 SpamBrain rules. Usually
        30–120 seconds. Safe to leave this page open — your report link is already stable.
      </p>

      <div className="mt-8 overflow-hidden rounded-[28px] border border-border/70 bg-card/60 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-3.5 text-xs">
          <span className="font-mono text-muted-foreground">{host ?? "—"}</span>
          <span className="font-mono tabular-nums text-muted-foreground">{elapsed}s</span>
        </div>

        <div className="px-6 pb-4 pt-6">
          <ScanningTiles title="Live scan preview — decorative" />
        </div>

        <ul className="flex flex-col gap-3 border-t border-border/60 px-6 py-5">
          {STEPS.map((s, i) => {
            const done = !err && (activeIndex > i || status === "completed");
            const active =
              !err && !done && (activeIndex === i || (activeIndex === -1 && i === 0));
            const failed = !!err && i === Math.max(activeIndex, 0);
            return (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <StatusGlyph
                  state={failed ? "failed" : done ? "done" : active ? "active" : "idle"}
                />
                <span className={done || active ? "text-foreground" : "text-muted-foreground/60"}>
                  {s.label}
                </span>
                {active && !err && (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-primary">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    live
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {err && (
          <div className="m-6 mt-0 flex flex-col gap-4 rounded-[18px] border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="text-destructive">{err}</p>
            <p className="text-xs text-muted-foreground">
              Common causes: the site blocked our crawler, the URL isn&apos;t reachable, or it
              served no indexable pages. Try a different URL or the root domain.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={sourceUrl ? `/?prefill=${encodeURIComponent(sourceUrl)}` : "/"}
                className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Try again
              </Link>
              <Link
                href="/"
                className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Back to home
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function StatusGlyph({ state }: { state: "done" | "active" | "idle" | "failed" }) {
  if (state === "done") {
    return (
      <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-success/50 bg-success/10 text-[11px] text-success">
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-primary/60 bg-primary/10">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-destructive/50 bg-destructive/10 text-[11px] text-destructive">
        ✕
      </span>
    );
  }
  return (
    <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-border text-[11px] text-muted-foreground/50">
      ○
    </span>
  );
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
