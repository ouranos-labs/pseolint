"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, Lock, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setDomainVisibilityAction } from "@/app/dashboard/domain-actions";
import { LEADERBOARD_MIN_PAGES, LEADERBOARD_RISK_MAX } from "@/lib/leaderboard";

/**
 * Site-level publish control. Lives here rather than on a report because the
 * choice belongs to the SITE: every audit of this domain inherits it, and a
 * per-report toggle was undone by the next scheduled run.
 *
 * The copy states the leaderboard consequence up front. Publishing puts a
 * named site on a public page, so burying that in a tooltip would be the kind
 * of dark pattern this product exists to argue against.
 */
export function SiteVisibilityCard({
  domainHost,
  initialIsPublic,
  latest,
}: {
  domainHost: string;
  initialIsPublic: boolean;
  /** Latest completed audit, for showing whether the other two bars are met. */
  latest: { risk: number | null; pageCount: number | null } | null;
}) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Mirrors isLeaderboardEligible()'s other two conditions. Shown so a user who
  // publishes and does not appear can see WHY, instead of assuming it's broken.
  const pagesOk = latest?.pageCount != null && latest.pageCount >= LEADERBOARD_MIN_PAGES;
  const riskOk = latest?.risk != null && latest.risk < LEADERBOARD_RISK_MAX;
  const wouldList = isPublic && pagesOk && riskOk;

  function toggle() {
    const next = !isPublic;
    start(async () => {
      const res = await setDomainVisibilityAction(domainHost, next);
      if (res.ok) {
        setIsPublic(res.isPublic);
        toast.success(
          res.isPublic
            ? `${domainHost} is public. ${res.auditsUpdated} audit${res.auditsUpdated === 1 ? "" : "s"} updated.`
            : `${domainHost} is private and delisted from the leaderboard.`,
        );
        router.refresh();
      } else if (res.upgrade) {
        toast.error(res.error, {
          action: { label: "See Pro", onClick: () => router.push(res.upgrade!) },
        });
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className="rounded-[22px] border border-border/70 bg-card/60 p-5 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            {isPublic ? <Globe className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
            Site visibility
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPublic ? (
              <>
                <span className="font-medium text-foreground">Public.</span> Audits of{" "}
                <span className="font-mono">{domainHost}</span> can be viewed by anyone with the
                link, and this site is listed on the public leaderboard by name.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">Private.</span> Only you can see
                audits of <span className="font-mono">{domainHost}</span>. It is not listed
                anywhere public.
              </>
            )}
          </p>
        </div>

        <Button onClick={toggle} disabled={pending} variant={isPublic ? "outline" : "default"}>
          {pending ? "Saving…" : isPublic ? "Make private" : "Make public"}
        </Button>
      </div>

      {/* The consequence, stated before the click rather than after it. */}
      <div className="mt-4 flex items-start gap-2.5 rounded-[14px] border border-border/70 bg-background/60 p-3.5">
        <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              Making a site public lists it on the{" "}
              <a href="/leaderboard" className="underline underline-offset-2">
                leaderboard
              </a>{" "}
              automatically.
            </span>{" "}
            Your domain, score and verdict appear publicly, and the report page becomes
            search-indexable. Making it private again removes it.
          </p>
          <p className="mt-2">
            Two further bars decide whether a public site actually ranks, so opting in does not by
            itself guarantee a listing:
          </p>
          <ul className="mt-2 space-y-1">
            <li className="flex items-center gap-2">
              <Mark ok={pagesOk} />
              At least {LEADERBOARD_MIN_PAGES} pages audited
              {latest?.pageCount != null && <span className="text-xs">(you have {latest.pageCount})</span>}
            </li>
            <li className="flex items-center gap-2">
              <Mark ok={riskOk} />
              Risk below {LEADERBOARD_RISK_MAX}
              {latest?.risk != null && <span className="text-xs">(you are at {latest.risk})</span>}
            </li>
          </ul>
          {latest == null && (
            <p className="mt-2 text-xs">
              No completed audit yet, so neither bar can be evaluated.
            </p>
          )}
          {isPublic && !wouldList && latest != null && (
            <p className="mt-2 text-xs">
              This site is public but does not currently meet the bars above, so it is not listed.
              It appears automatically once a re-audit clears them.
            </p>
          )}
          {wouldList && (
            <p className="mt-2 text-xs">This site currently meets every condition and is listed.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${ok ? "bg-primary" : "bg-border-strong"}`}
    />
  );
}
