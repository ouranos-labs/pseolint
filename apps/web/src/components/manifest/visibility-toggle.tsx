"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Owner-only toggle for the manifest's `isPublic` flag. The toggle
 * doesn't expose LLM-proposed rewrites publicly: even when public, the
 * `/m/<slug>` page renders a paraphrased view for non-owners. This is
 * for explicit curation (sharing for feedback, leaderboard inclusion).
 */
export function ManifestVisibilityToggle({
  slug,
  initialIsPublic,
}: {
  slug: string;
  initialIsPublic: boolean;
}) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const flip = () => {
    setError(null);
    const next = !isPublic;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/manifest/${slug}/visibility`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isPublic: next }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? `failed (${res.status})`);
          return;
        }
        setIsPublic(next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${isPublic ? "bg-success" : "bg-muted-foreground"}`} aria-hidden />
        <span className="text-xs font-medium text-foreground">
          {isPublic ? "Public link" : "Private (owner only)"}
        </span>
      </div>
      <button
        onClick={flip}
        disabled={pending}
        className="inline-flex h-8 items-center rounded-[10px] border border-border-strong bg-card px-3 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-50"
      >
        {pending ? "Updating…" : isPublic ? "Make private" : "Make public"}
      </button>
      <span className="text-[11px] text-muted-foreground">
        {isPublic
          ? "Anyone with the URL sees a paraphrased summary. Patch diffs stay owner-only."
          : "Toggle to share a paraphrased summary publicly. Diffs always stay owner-only."}
      </span>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
