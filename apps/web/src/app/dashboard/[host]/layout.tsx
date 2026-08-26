import { Suspense } from "react";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
import { VerifyBanner } from "@/components/dashboard/verify-banner";
import { detectDnsProvider } from "@/lib/dns-provider";
import { getWorkspaceDomain, listWorkspaceDomains } from "./_data";
import { WorkspaceTabs } from "./workspace-tabs";

export const runtime = "nodejs";

/**
 * Shell for the domain workspace. Owns the identity chrome (breadcrumb, host,
 * re-audit / settings / remove, domain switcher, tab bar) so it renders ONCE
 * and is preserved across tab navigations: switching Overview → Traffic swaps
 * only the page body.
 *
 * Deliberately cheap: two small cached queries. The expensive per-section work
 * lives in the sibling pages, so a slow GSC or R2 read can no longer keep the
 * header (the "where am I") from painting.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ host: string }>;
}) {
  const { host: rawHost } = await params;
  const [domain, domains] = await Promise.all([
    getWorkspaceDomain(rawHost),
    listWorkspaceDomains(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader
        domain={{ host: domain.host, sourceUrl: domain.sourceUrl }}
        domains={domains}
      />

      {/* Unverified domains can't be monitored, so this stays above the tabs on
          every section. The DNS lookup behind the provider hint is a network
          round-trip, so it streams in rather than blocking the shell. */}
      {!domain.verifiedAt && (
        <Suspense
          fallback={
            <div className="h-24 animate-pulse rounded-[18px] bg-muted/30" aria-hidden />
          }
        >
          <VerifyBannerSection host={domain.host} token={domain.verificationToken} />
        </Suspense>
      )}

      <WorkspaceTabs host={domain.host} />

      {children}
    </div>
  );
}

async function VerifyBannerSection({ host, token }: { host: string; token: string | null }) {
  return <VerifyBanner host={host} token={token} provider={await detectDnsProvider(host)} />;
}
