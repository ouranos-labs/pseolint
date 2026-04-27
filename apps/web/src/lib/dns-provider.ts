import { promises as dns } from "node:dns";

/**
 * Best-effort DNS provider detection from a host's NS records.
 *
 * The deep links go to the provider's DNS-records dashboard. They cannot
 * pre-fill the form (no major DNS provider supports record values via URL
 * params), but landing on the right page in the right account removes 80%
 * of the friction. The user still pastes the values (we surface them
 * copy-pastably in the verify banner).
 *
 * `dashboardUrl` may contain `{host}` which we substitute. When a provider
 * needs an account/team ID we don't have, we fall back to the general
 * dashboard.
 */
export interface ProviderInfo {
  id: string;
  name: string;
  dashboardUrl: string;
  /** Short tip on what label the provider uses for the record-add form. */
  tip?: string;
}

const PROVIDERS: Array<{ match: RegExp; info: ProviderInfo }> = [
  {
    match: /\.cloudflare\.com\.?$/i,
    info: {
      id: "cloudflare",
      name: "Cloudflare",
      dashboardUrl: "https://dash.cloudflare.com/?to=/:account/:zone/dns/records",
      tip: "DNS → Records → Add record. Set Type=TXT, Name=_pseolint-verify, paste the value.",
    },
  },
  {
    match: /\.domaincontrol\.com\.?$/i,
    info: {
      id: "godaddy",
      name: "GoDaddy",
      dashboardUrl: "https://dcc.godaddy.com/control/portfolio/{host}/settings?tab=dns",
      tip: "DNS → Records → Add → TXT.",
    },
  },
  {
    match: /\.registrar-servers\.com\.?$/i,
    info: {
      id: "namecheap",
      name: "Namecheap",
      dashboardUrl: "https://ap.www.namecheap.com/Domains/DomainControlPanel/{host}/advancedns",
      tip: "Advanced DNS → Add New Record → TXT.",
    },
  },
  {
    match: /^ns-\d+\.awsdns-\d+\.(com|net|org|co\.uk)\.?$/i,
    info: {
      id: "route53",
      name: "AWS Route53",
      dashboardUrl: "https://console.aws.amazon.com/route53/v2/hostedzones",
      tip: "Open the hosted zone for this domain → Create record → TXT.",
    },
  },
  {
    match: /\.googledomains\.com\.?$/i,
    info: {
      id: "google-squarespace",
      name: "Squarespace Domains (formerly Google Domains)",
      dashboardUrl: "https://account.squarespace.com/domains",
      tip: "Open the domain → DNS → Custom Records → TXT.",
    },
  },
  {
    match: /\.dns\.squarespace\.com\.?$/i,
    info: {
      id: "squarespace",
      name: "Squarespace",
      dashboardUrl: "https://account.squarespace.com/domains",
      tip: "Open the domain → DNS Settings → Custom Records → TXT.",
    },
  },
  {
    match: /\.vercel-dns\.com\.?$/i,
    info: {
      id: "vercel",
      name: "Vercel",
      dashboardUrl: "https://vercel.com/dashboard/domains",
      tip: "Open the domain → DNS Records → Add → TXT.",
    },
  },
  {
    match: /\.proxy\.webflow\.com\.?$|\.webflow\.com\.?$/i,
    info: {
      id: "webflow",
      name: "Webflow",
      dashboardUrl: "https://webflow.com/dashboard/sites",
      tip: "Webflow's hosted DNS doesn't expose TXT records directly. Add the TXT at your registrar (the place you bought the domain).",
    },
  },
  {
    match: /\.gandi\.net\.?$/i,
    info: {
      id: "gandi",
      name: "Gandi",
      dashboardUrl: "https://admin.gandi.net/domain",
      tip: "Open the domain → DNS Records → Add a record → TXT.",
    },
  },
  {
    match: /\.dnsimple\.com\.?$/i,
    info: {
      id: "dnsimple",
      name: "DNSimple",
      dashboardUrl: "https://dnsimple.com/account",
      tip: "Open the domain → DNS → Add Record → TXT.",
    },
  },
  {
    match: /\.digitalocean\.com\.?$/i,
    info: {
      id: "digitalocean",
      name: "DigitalOcean",
      dashboardUrl: "https://cloud.digitalocean.com/networking/domains",
      tip: "Open the domain → Create new record → TXT.",
    },
  },
  {
    match: /\.hover\.com\.?$/i,
    info: {
      id: "hover",
      name: "Hover",
      dashboardUrl: "https://www.hover.com/signin",
      tip: "Open the domain → DNS → Add A Record → TXT.",
    },
  },
];

/**
 * Look up NS records and match against known providers. Returns null when
 * the host has no NS records, lookup fails, or no provider matches.
 *
 * Failure is non-fatal: the verify banner still works without provider
 * detection — it just falls back to the generic instructions.
 */
export async function detectDnsProvider(host: string): Promise<ProviderInfo | null> {
  let nsRecords: string[];
  try {
    nsRecords = await dns.resolveNs(host);
  } catch {
    return null;
  }
  if (!nsRecords.length) return null;
  for (const ns of nsRecords) {
    for (const { match, info } of PROVIDERS) {
      if (match.test(ns)) {
        return {
          ...info,
          dashboardUrl: info.dashboardUrl.replace("{host}", encodeURIComponent(host)),
        };
      }
    }
  }
  return null;
}
