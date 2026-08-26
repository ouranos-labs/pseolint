import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fixManifests, orchestratorSessions } from "@/db/schema";
import { fetchSummaryJson } from "@/lib/r2";
import { getOptionalSession } from "@/lib/session";
import { PatchDiffCard } from "@/components/manifest/patch-diff-card";
import { ManifestVisibilityToggle } from "@/components/manifest/visibility-toggle";
import type { FixManifest, ManifestDiff, ManifestValidationReport } from "@pseolint/core";
import { formatDateTime } from "@/lib/format";

export const runtime = "nodejs";

interface ManifestPayload {
  manifest: FixManifest;
  validation: ManifestValidationReport;
  diff: ManifestDiff;
}

async function findManifest(slug: string) {
  const [row] = await db
    .select({
      manifest: fixManifests,
      session: orchestratorSessions,
    })
    .from(fixManifests)
    .where(eq(fixManifests.slug, slug))
    .leftJoin(orchestratorSessions, eq(fixManifests.sessionId, orchestratorSessions.id))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await findManifest(slug);
  // Manifests describe third-party sites with LLM-proposed rewrites: never
  // index. Same posture as audit reports per the v0.4 design.
  const robots: Metadata["robots"] = { index: false, follow: false };
  if (!row) return { title: "Manifest not found · pseolint", robots };
  return {
    title: `${row.manifest.domain} · pseolint manifest`,
    description: `AI-orchestrated fix manifest for ${row.manifest.domain}. ${row.manifest.validPatchCount}/${row.manifest.totalPatchCount} patches valid. Verdict: ${row.manifest.verdict}.`,
    robots,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await findManifest(slug);
  if (!row) notFound();

  const session = await getOptionalSession();
  const ownedByUser = !!(session?.user.id && row.session?.userId === session.user.id);

  // Per spec §11.7:
  //   - Owner: full view with rewrites + diffs
  //   - Public + foreign visitor: paraphrased view (verdict, categories,
  //     patch counts): no LLM rewrites or diffs
  //   - Private + foreign visitor: 404 (avoids leaking slug existence)
  if (!ownedByUser && !row.manifest.isPublic) notFound();
  const showRewrites = ownedByUser;

  const blob = await fetchSummaryJson(row.manifest.manifestKey);
  // Row exists but R2 blob is gone = expired by the daily cleanup cron.
  // Show a dedicated "expired" state rather than a generic 404 so users
  // who saved the URL understand what happened.
  if (!blob) return <ExpiredManifest domain={row.manifest.domain} expiredAt={row.manifest.expiresAt} />;
  let payload: ManifestPayload;
  try {
    payload = JSON.parse(blob) as ManifestPayload;
  } catch {
    // Corrupted blob: distinct from expired but rare enough to share UX.
    return <ExpiredManifest domain={row.manifest.domain} expiredAt={row.manifest.expiresAt} />;
  }

  const { manifest, validation, diff } = payload;
  const totalPatches = manifest.pages.reduce((acc, p) => acc + p.changes.length, 0)
    + manifest.templates.reduce((acc, t) => acc + t.examples.reduce((a, e) => a + e.changes.length, 0), 0)
    + manifest.domainLevel.length;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <span aria-hidden>←</span> Back to dashboard
      </Link>

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
        Orchestrator manifest · {row.session?.completedAt ? formatDateTime(row.session.completedAt) : "recently"}
      </div>

      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        {manifest.domain}
      </h1>

      <div className="mt-6 grid gap-4 rounded-[28px] border border-border/70 bg-card/60 p-7 backdrop-blur-sm sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-stretch sm:gap-10 sm:p-8">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Verdict</span>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border-strong bg-card px-3 py-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${verdictDot(manifest.verdict)}`} />
            <span
              className={`text-2xl tabular-nums ${verdictTone(manifest.verdict)}`}
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
            >
              {labelFor(manifest.verdict)}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["integrity", "discoverability", "citation", "data"] as const).map((cat) => {
              const grade = manifest.categories[cat];
              return (
                <div key={cat} className={`rounded-[14px] border ${gradeTone(grade).border} ${gradeTone(grade).bg} p-3 text-center`}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{cat}</div>
                  <div
                    className={`mt-1 leading-none tabular-nums ${gradeTone(grade).tone}`}
                    style={{ fontFamily: "var(--font-display)", fontSize: "32px" }}
                  >
                    {grade}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 self-end text-sm sm:grid-cols-4">
          <Stat label="Pages" value={manifest.pages.length} sub="patched" />
          <Stat label="Templates" value={manifest.templates.length} sub="patched" />
          <Stat label="Domain" value={manifest.domainLevel.length} sub="patches" />
          <Stat
            label="Valid"
            value={`${validation.validPatches}/${totalPatches}`}
            sub={validation.failures.length > 0 ? `${validation.failures.length} dropped` : "all clean"}
            tone={validation.failures.length > 0 ? "text-warning" : "text-success"}
          />
        </dl>
      </div>

      {ownedByUser && row.session && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 rounded-[18px] border border-border/60 bg-card/40 px-6 py-4 text-sm">
          <Stat
            label="Cost"
            value={`$${Number(row.session.spentUsd).toFixed(3)}`}
            sub={`of $${Number(row.session.budgetUsd).toFixed(2)} cap`}
          />
          <Stat label="Tool calls" value={row.session.toolCallCount} />
          <Stat
            label="Tokens"
            value={`${fmtTokens(row.session.inputTokens)} / ${fmtTokens(row.session.outputTokens)}`}
            sub="in / out"
          />
          {row.session.durationMs != null && (
            <Stat label="Duration" value={`${Math.round(row.session.durationMs / 1000)}s`} />
          )}
        </dl>
      )}

      {ownedByUser && (
        <div className="mt-6">
          <ManifestVisibilityToggle slug={slug} initialIsPublic={row.manifest.isPublic} />
        </div>
      )}

      {validation.failures.length > 0 && showRewrites && (
        <section className="mt-6 rounded-[18px] border border-warning/30 bg-warning/5 p-5">
          <h2 className="text-sm font-medium text-foreground">Patches dropped by validators</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The orchestrator proposed these but they failed deterministic safety checks. They&apos;re not part of the manifest below.
          </p>
          <ul className="mt-3 space-y-1.5">
            {validation.failures.slice(0, 10).map((f, i) => (
              <li key={i} className="font-mono text-[11px] text-muted-foreground">
                <span className="text-warning">×</span> {failureLocation(f)}: {f.reason}
              </li>
            ))}
            {validation.failures.length > 10 && (
              <li className="text-xs text-muted-foreground">… and {validation.failures.length - 10} more</li>
            )}
          </ul>
        </section>
      )}

      {!showRewrites && (
        <>
          <section className="mt-6 rounded-[18px] border border-border/60 bg-card/40 p-5 text-sm text-muted-foreground">
            <p className="text-foreground">
              <strong>Public manifest summary.</strong> Verdict and category grades are shown above; specific
              LLM-proposed rewrites and patch diffs are owner-only.
            </p>
            <p className="mt-2 text-xs">
              The orchestrator audited <strong>{manifest.pages.length}</strong> page
              {manifest.pages.length === 1 ? "" : "s"}, <strong>{manifest.templates.length}</strong> template cluster
              {manifest.templates.length === 1 ? "" : "s"}, and proposed <strong>{manifest.domainLevel.length}</strong> domain-level
              change{manifest.domainLevel.length === 1 ? "" : "s"}. {validation.validPatches} of {validation.totalPatches} patches passed deterministic
              safety validators before being saved to the manifest.
            </p>
          </section>

          {manifest.templates.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Template patterns audited ({manifest.templates.length})
              </h2>
              <ul className="space-y-2">
                {manifest.templates.map((t, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[12px] border border-border/60 bg-card/40 px-4 py-2.5"
                  >
                    <span className="font-mono text-xs text-foreground">{t.templateId}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {t.affectedUrlCount} URL{t.affectedUrlCount === 1 ? "" : "s"}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.recommendation}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Pattern names + URL counts are deterministic findings from the rules engine. Specific rewrite
                examples per template are owner-only.
              </p>
            </section>
          )}

          <section className="mt-10 rounded-[22px] border border-primary/25 bg-primary/5 p-6">
            <p className="text-sm font-medium text-foreground">
              Want a fix manifest for your own domain?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              pseolint runs an AI-orchestrated audit and produces concrete copy-paste patches.
            </p>
            <Link
              href="/dashboard"
              className="mt-3 inline-flex h-9 items-center rounded-[12px] bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Run an audit →
            </Link>
          </section>
        </>
      )}

      {showRewrites && diff.domainLevel.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Domain-level patches
          </h2>
          <div className="space-y-4">
            {diff.domainLevel.map((d, i) => (
              <PatchDiffCard key={i} diff={d} />
            ))}
          </div>
        </section>
      )}

      {showRewrites && diff.templates.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Template-level patches ({diff.templates.length})
          </h2>
          <div className="space-y-6">
            {diff.templates.map((t, i) => (
              <div key={i} className="rounded-[22px] border border-primary/25 bg-primary/5 p-5">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h3 className="font-mono text-sm font-medium text-foreground">{t.templateId}</h3>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {t.affectedUrlCount} URLs
                  </span>
                </div>
                <p className="mb-4 text-sm leading-relaxed text-foreground">{t.recommendation}</p>
                {t.examples.flatMap((ex, j) =>
                  ex.diffs.map((d, k) => (
                    <div key={`${j}-${k}`} className="mt-3">
                      <PatchDiffCard diff={d} label={`Example: ${ex.url}`} />
                    </div>
                  )),
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {showRewrites && diff.pages.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Page-level patches ({diff.pages.length})
          </h2>
          <div className="space-y-6">
            {diff.pages.map((p, i) => (
              <div key={i} className="space-y-3">
                <div className="font-mono text-xs text-muted-foreground">{p.url}</div>
                {p.diffs.map((d, j) => (
                  <PatchDiffCard key={j} diff={d} />
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {showRewrites && diff.pages.length === 0 && diff.templates.length === 0 && diff.domainLevel.length === 0 && (
        <section className="mt-10 rounded-[22px] border border-dashed border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
          The orchestrator found nothing actionable on this domain. (Or every patch was dropped by validators: see above.)
        </section>
      )}

      <section className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-xs text-muted-foreground">
        <p className="text-sm font-medium text-foreground">About this manifest</p>
        <p className="mt-2 leading-relaxed">
          AI-orchestrated audit. The orchestrator drove 25 deterministic tools to produce these patches; every patch passed a schema validator before reaching this page. Apply patches manually or download the JSON for programmatic use.
        </p>
      </section>
    </main>
  );
}

function ExpiredManifest({ domain, expiredAt }: { domain: string; expiredAt: Date }) {
  return (
    <main className="mx-auto max-w-xl px-5 pb-20 pt-20">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        Manifest expired
      </div>
      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        {domain}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        This manifest&apos;s retention window ended on {expiredAt.toISOString().slice(0, 10)} and the
        underlying patch data was cleaned up. Run a fresh orchestrator audit from your dashboard to
        regenerate.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to dashboard
        </Link>
        <Link
          href="/dashboard/manifests"
          className="inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          See all manifests
        </Link>
      </div>
    </main>
  );
}

function failureLocation(f: ManifestValidationReport["failures"][number]): string {
  if (f.location.kind === "page_patch") {
    return `${f.location.pageUrl} · ${f.location.patchType}`;
  }
  if (f.location.kind === "template_patch") {
    return `${f.location.templateId} · ${f.location.patchType}`;
  }
  return `${f.location.patchType} (domain)`;
}

function verdictDot(v: FixManifest["verdict"]): string {
  switch (v) {
    case "ready": return "bg-success";
    case "caution": return "bg-warning";
    case "concerning": return "bg-warning";
    case "critical": return "bg-destructive";
  }
}

function verdictTone(v: FixManifest["verdict"]): string {
  switch (v) {
    case "ready": return "text-success";
    case "caution": return "text-warning";
    case "concerning": return "text-warning";
    case "critical": return "text-destructive";
  }
}

function labelFor(v: FixManifest["verdict"]): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function gradeTone(grade: string): { tone: string; border: string; bg: string } {
  if (grade === "A" || grade === "B") return { tone: "text-success", border: "border-success/30", bg: "bg-success/5" };
  if (grade === "C") return { tone: "text-warning", border: "border-warning/30", bg: "bg-warning/5" };
  if (grade === "D") return { tone: "text-warning", border: "border-warning/50", bg: "bg-warning/10" };
  return { tone: "text-destructive", border: "border-destructive/40", bg: "bg-destructive/5" };
}

/** Compact token count: 12345 → "12.3K", 1_200_000 → "1.2M". */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function Stat({ label, value, sub, tone = "text-foreground" }: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col text-nowrap">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`font-mono text-lg tabular-nums ${tone}`}>{value}</dd>
      {sub && <span className="font-mono text-[10px] text-muted-foreground/70">{sub}</span>}
    </div>
  );
}
