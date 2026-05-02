import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";
import { inferUrlTemplate } from "@pseolint/core";
import { db } from "@/db";
import { monitoredDomains, findingsState } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { sevDot, sevBorderBg, sevText, type Severity } from "@/lib/severity-style";
import { FindingRowActions } from "@/components/dashboard/finding-row-actions";

const SEV_RANK: Record<Severity, number> = { critical: 0, error: 1, warning: 2, info: 3 };
const SEV_ORDER: Severity[] = ["critical", "error", "warning", "info"];
const SEV_LABEL: Record<Severity, string> = {
  critical: "Critical",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

export default async function UrlDeepDive({
  params,
}: {
  params: Promise<{ host: string; urlEncoded: string }>;
}) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  const plan = await getPlan(session.user.id);
  if (plan !== "pro") redirect("/pricing");

  const { host: rawHost, urlEncoded } = await params;
  const host = decodeURIComponent(rawHost);
  const decodedUrl = decodeURIComponent(urlEncoded);

  try {
    new URL(decodedUrl);
  } catch {
    notFound();
  }

  const [domain] = await db
    .select()
    .from(monitoredDomains)
    .where(
      and(
        eq(monitoredDomains.host, host),
        eq(monitoredDomains.userId, session.user.id),
        isNull(monitoredDomains.removedAt),
      ),
    )
    .limit(1);
  if (!domain) notFound();

  let templateSig: string;
  try {
    templateSig = inferUrlTemplate(decodedUrl);
  } catch {
    templateSig = decodedUrl;
  }

  const rows = await db
    .select()
    .from(findingsState)
    .where(
      and(
        eq(findingsState.domainId, domain.id),
        or(
          eq(findingsState.representativeUrl, decodedUrl),
          eq(findingsState.templateSignature, templateSig),
        ),
      ),
    );

  const sorted = [...rows].sort((a, b) => {
    const aOpen = a.status === "open" ? 0 : 1;
    const bOpen = b.status === "open" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    const aSev = SEV_RANK[a.severityLatest as Severity];
    const bSev = SEV_RANK[b.severityLatest as Severity];
    if (aSev !== bSev) return aSev - bSev;
    return Number(b.rankScore) - Number(a.rankScore);
  });

  const total = sorted.length;
  const open = sorted.filter((r) => r.status === "open").length;
  const suppressed = total - open;
  const lastSeen =
    sorted.length > 0
      ? sorted.reduce<Date | null>((acc, r) => {
          const d = r.lastSeenAt instanceof Date ? r.lastSeenAt : new Date(r.lastSeenAt);
          if (!acc || d.getTime() > acc.getTime()) return d;
          return acc;
        }, null)
      : null;

  const groups = SEV_ORDER.map((sev) => ({
    sev,
    rows: sorted.filter((r) => r.severityLatest === sev),
  })).filter((g) => g.rows.length > 0);

  const shortLabel = shortenUrlForBreadcrumb(decodedUrl);

  return (
    <div className="flex flex-col gap-6">
      <nav className="font-mono text-[11px] text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          Portfolio
        </Link>
        <span className="mx-1.5">/</span>
        <Link
          href={`/dashboard/${encodeURIComponent(host)}`}
          className="hover:text-foreground"
        >
          {host}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">url:{shortLabel}</span>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              URL HISTORY
            </span>
            <div className="mt-1.5 overflow-x-auto">
              <span className="block whitespace-nowrap font-mono text-foreground">
                {decodedUrl}
              </span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
              template: {templateSig}
            </div>
          </div>
          <a
            href={decodedUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 rounded-[10px] border border-border/60 bg-card/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground"
          >
            Open page ↗
          </a>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-[18px] border border-border/60 bg-card/40 p-6 sm:grid-cols-4">
        <Stat label="Findings" value={String(total)} tone="text-foreground" />
        <Stat label="Open" value={String(open)} tone={open > 0 ? "text-destructive" : "text-foreground"} />
        <Stat label="Suppressed" value={String(suppressed)} tone="text-muted-foreground" />
        <Stat label="Last seen" value={lastSeen ? relTime(lastSeen) : "—"} tone="text-foreground" />
      </dl>

      {sorted.length === 0 ? (
        <div className="rounded-[18px] border border-success/30 bg-success/5 p-8 text-center">
          <p
            className="text-success"
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: "24px",
            }}
          >
            No findings on this URL.
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This page is clean — pSEOLint has no record of any rule firing here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <div key={g.sev}>
              <h3
                className={`mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${sevText(
                  g.sev,
                )}`}
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${sevDot(g.sev)}`} />
                {SEV_LABEL[g.sev]}
                <span className="font-mono text-[11px] font-normal text-muted-foreground">
                  · {g.rows.length}
                </span>
              </h3>
              <ul className="flex flex-col gap-2">
                {g.rows.map((r) => {
                  const isSuppressed = r.status !== "open";
                  const firstSeen =
                    r.firstSeenAt instanceof Date ? r.firstSeenAt : new Date(r.firstSeenAt);
                  const lastSeenAt =
                    r.lastSeenAt instanceof Date ? r.lastSeenAt : new Date(r.lastSeenAt);
                  // v0.5+ carriedForward signal: when the latest monitoring
                  // run skipped this URL pre-fetch, mergeFindings did NOT
                  // update lastSeenAt. So if the domain's lastRunAt has
                  // advanced significantly past this finding's lastSeenAt,
                  // it carried forward without re-verification. The 6-hour
                  // grace window absorbs cron jitter (hourly tick + ±30min).
                  const STALE_GRACE_MS = 6 * 60 * 60 * 1000;
                  const carriedForward = domain.lastRunAt
                    ? domain.lastRunAt.getTime() - lastSeenAt.getTime() > STALE_GRACE_MS
                    : false;
                  return (
                    <li key={r.id}>
                      <article
                        className={`overflow-hidden rounded-[18px] border ${
                          isSuppressed
                            ? "border-border/40 bg-card/20 opacity-70"
                            : "border-border/60 bg-card/60"
                        }`}
                      >
                        <div className="flex flex-col gap-2 px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${sevBorderBg(
                                r.severityLatest as Severity,
                              )}`}
                            >
                              <span
                                className={`inline-block h-1 w-1 rounded-full ${sevDot(
                                  r.severityLatest as Severity,
                                )}`}
                              />
                              {r.severityLatest}
                            </span>
                            <code className="rounded-md border border-border/60 bg-card/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                              {r.ruleId}
                            </code>
                            {isSuppressed && (
                              <span className="inline-flex items-center rounded-full border border-border/50 bg-card/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                {r.status === "snoozed" ? "Snoozed" : "Dismissed"}
                              </span>
                            )}
                            {carriedForward && (
                              <span
                                className="inline-flex items-center rounded-full border border-border/50 bg-card/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                                title={`This finding was carried forward from a prior monitoring run — last actually re-verified ${relTime(lastSeenAt)}. The page hasn't changed enough to trigger a re-fetch.`}
                              >
                                Carried forward · verified {relTime(lastSeenAt)}
                              </span>
                            )}
                            <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                              {r.affectedPageCount}{" "}
                              {r.affectedPageCount === 1 ? "page" : "pages"}
                            </span>
                          </div>
                          <p className="text-sm text-foreground">{r.ruleMessageLatest}</p>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="font-mono text-[11px] text-muted-foreground">
                              first seen {relTime(firstSeen)} · last seen {relTime(lastSeenAt)}
                            </div>
                            {!isSuppressed && <FindingRowActions findingId={r.id} />}
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-1 font-mono tabular-nums text-2xl ${tone}`}>{value}</dd>
    </div>
  );
}

function shortenUrlForBreadcrumb(url: string): string {
  let label: string;
  try {
    const u = new URL(url);
    label = u.pathname === "/" ? "/" : u.pathname;
  } catch {
    label = url;
  }
  if (label.length > 60) return label.slice(0, 57) + "...";
  return label;
}

function relTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return h + "h ago";
  const days = Math.round(h / 24);
  return days + "d ago";
}

