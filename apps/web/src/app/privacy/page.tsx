import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Privacy Policy · pseolint",
  description:
    "What personal data pseolint collects, why, how long we keep it, who we share it with, and the rights you have over it. GDPR-aligned, plain-language.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

const EFFECTIVE = "2026-04-20";
const CONTROLLER_NAME = "pseolint";
const CONTACT_EMAIL = "philippe.kam27@gmail.com";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Who is the data controller?",
    a: "pseolint, operating the service at pseolint.dev. Contact philippe.kam27@gmail.com. The policy covers pseolint.dev, its API, the CLI when it communicates with our servers, and transactional email we send you. It does not cover websites we audit on your instruction; those are separately controlled by their operators.",
  },
  {
    q: "What personal data does pseolint collect, and why?",
    a: "Email address (for magic-link auth and audit-completion notifications), account metadata (name, timezone, UI preferences), audited URLs and rendered reports, a SHA-256 hashed IP combined with a 30-day rotating server-side salt for rate limiting, an anonymous session cookie, an authentication cookie (HttpOnly, Secure, SameSite=Lax, 30-day inactivity expiry), billing metadata via Polar.sh ($19/month Pro), and aggregate request logs retained 30 days. No raw IPs, no card data. Product analytics is first-party, self-hosted, and cookieless (see Analytics below).",
  },
  {
    q: "How long does pseolint keep data?",
    a: "Anonymous audit reports: 24 hours. Free-account reports: 30 days. Pro-account reports: kept until you delete. Account email and profile: kept while your account is open, deleted within 30 days of account closure. Invoices: 10 years per EU tax law. Salted IP hashes: 14 days, with the salt itself rotating every 30 days. Aggregate request logs: 30 days. Email delivery logs purge after 90 days.",
  },
  {
    q: "Who does pseolint share data with?",
    a: "Subprocessors: Neon (EU Postgres hosting), Cloudflare R2 (EU-first object storage), Cloudflare Turnstile (bot challenge), Polar.sh (merchant of record for $19/month Pro subscriptions), Resend (transactional email), Google (only if you choose OAuth sign-in), Anthropic (Pro AI triage under zero-retention API terms), and Inngest (background job orchestration). International transfers rely on the EU-US Data Privacy Framework and Standard Contractual Clauses.",
  },
  {
    q: "What rights do I have under GDPR?",
    a: "Right of access (we respond within 30 days), rectification, erasure (DELETE /api/account or email us, removes everything within 30 days), portability (GET /api/account/export returns JSON), restriction, objection, withdrawing consent, and lodging a complaint with your local data-protection authority (in France: CNIL, cnil.fr). We do not perform automated decision-making with legal effect.",
  },
];

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Legal · privacy
      </div>
      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        Privacy Policy
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Written plainly. This page tells you exactly what personal data we collect when you use
        pseolint, why we collect it, how long we keep it, who else sees it, and the rights you
        have to change, export, or delete it.
      </p>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Privacy notice scope: this disclosure governs the pseolint hosted dashboard, audit submission
        endpoints, magic-link authentication flow, billing receipts dispatched via Polar.sh, and the
        pseolint-bot crawler when it fetches pages from sites you submit. It does not extend to
        third-party destinations our outbound links reach, nor to self-hosted CLI runs that never
        contact our servers; those execute entirely on your machine and never transmit audit
        bodies, IP fragments, or telemetry of any kind back to Ouranos Labs. This document was
        first published on April 20, 2026, aligns 100% with the GDPR Article 13 disclosure
        requirements, and was updated on April 30, 2026 to reflect the v0.4.0 engine cut.
      </p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        Effective {EFFECTIVE} · contact{" "}
        <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </p>

      <Section title="Who is the data controller">
        <Item k="Controller" v={`${CONTROLLER_NAME}, operating the service at pseolint.dev.`} />
        <Item k="Contact" v={<a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>} />
        <Item k="Scope" v="This policy covers pseolint.dev, its API, the CLI when it communicates with our servers, and transactional email we send you. It does not cover websites we audit on your instruction; those are separately controlled by their operators." />
      </Section>

      <Section title="What we collect, and why">
        <Item k="Email address" v="Collected when you create an account (magic link or Google OAuth). Used for authentication, sending the magic link, audit-completion notifications, and billing receipts. Legal basis: contract performance + legitimate interest (account security)." />
        <Item k="Account metadata" v="Name (from Google OAuth, if used), timezone, UI preferences. Legal basis: contract performance." />
        <Item k="Audited URLs and rendered reports" v="The URLs you submit, the HTML we fetch from them, the structured audit summaries we generate, and derived stats (score, counts). Legal basis: contract performance; we can't deliver the service without this." />
        <Item k="Hashed IP (rate-limit signal)" v="We store a SHA-256 hash of your IP combined with a rotating server-side salt. The raw IP is never written to storage; only the hash is. Legal basis: legitimate interest (abuse prevention). Salt rotates periodically, which unlinks historical hashes from current IPs." />
        <Item k="Anonymous session cookie" v="One opaque random ID (signed). Lets us tie a pre-sign-in audit to your browser so you can reclaim it on sign-up. Legal basis: strictly necessary (functional, exempt from EU cookie consent)." />
        <Item k="Authentication cookie" v="Issued after you sign in. HttpOnly, Secure, SameSite=Lax. Expires after 30 days of inactivity. Legal basis: strictly necessary." />
        <Item k="Billing metadata" v="Subscription plan, Polar customer ID, renewal date. We do NOT receive your card details; those stay with Polar.sh, our merchant of record. Legal basis: contract + legal obligation (invoicing, VAT)." />
        <Item k="Analytics" v="Aggregate request logs (route, status, response time) retained 30 days for debugging and capacity planning. Product analytics via OpenPanel, self-hosted on our own infrastructure (api-openpanel.philippekam.dev), first-party and cookieless: sessions are counted via a privacy-preserving daily-rotating hash of IP + user-agent, the same technique we use for rate limiting, with nothing persisted past 24 hours. No third-party analytics service, no cross-site identifiers, no advertising. Data is never sold or shared. Legal basis: legitimate interest." />
      </Section>

      <Section title="What we do NOT collect">
        <Item k="No raw IP addresses" v="They never touch disk. Only salted hashes do." />
        <Item k="No card / bank data" v="Polar.sh handles payment collection end-to-end." />
        <Item k="No third-party / cross-site tracking" v="No third-party or cross-site tracking. No Google Analytics, Segment, Mixpanel, FB pixel, LinkedIn pixel, or similar. No cross-site identifiers. Our product analytics is first-party and runs on our own servers." />
        <Item k="No advertising" v="We do not sell or rent data. We do not run ads. We do not participate in ad networks." />
        <Item k="No training on your data" v="Your audit content is not used to train AI models: ours or anyone else's. AI triage calls (Pro) send the minimum necessary snippet to Anthropic under their zero-retention terms." />
      </Section>

      <Section title="How long we keep data (retention)">
        <Item k="Anonymous audit reports" v="24 hours, then auto-deleted from storage. DB row keeps aggregate stats (score, page count) for internal analytics." />
        <Item k="Free-account audit reports" v="30 days, then the cached report body is deleted. Aggregate stats remain." />
        <Item k="Pro-account audit reports" v="Kept until you delete the audit or close the account." />
        <Item k="Account email + profile" v="Kept while your account is open. Deleted within 30 days of account deletion, except where we must retain something to meet a legal obligation (e.g. invoicing records)." />
        <Item k="Invoices and payment metadata" v="Retained 10 years per applicable tax/accounting law in the EU." />
        <Item k="Salted IP hashes" v="Deleted after 14 days. Salt rotates every 30 days, severing linkability beyond that window." />
        <Item k="Aggregate request logs" v="30 days." />
        <Item k="Email delivery logs (Resend)" v="Retained by Resend per their policy; we purge references after 90 days." />
      </Section>

      <Section title="Who we share data with (subprocessors)">
        <Item k="Neon (Postgres hosting)" v="Stores all account and audit metadata. Data region: EU. Contract: GDPR-compliant DPA." />
        <Item k="Cloudflare R2 (object storage)" v="Stores cached report HTML and structured summaries. Data region: auto-placed EU-first." />
        <Item k="Cloudflare Turnstile" v="Bot challenge on sign-in and audit submission. Receives a challenge token, not personal data beyond IP (which Cloudflare processes per its own terms)." />
        <Item k="Polar.sh (payments, merchant of record)" v="Receives your email and the purchase intent when you subscribe. Handles checkout, tax, and invoicing. See polar.sh/privacy." />
        <Item k="Resend (transactional email)" v="Receives your email address + the message content (magic link, audit-complete, alerts) at send time." />
        <Item k="Google (OAuth, if chosen)" v="Google is informed only that you used pseolint to sign in (inherent to OAuth). We receive your email and basic profile from Google." />
        <Item k="Anthropic (AI triage, Pro only)" v="For Pro accounts that run AI triage, an aggregated, anonymized finding summary is sent to Anthropic for root-cause analysis. Sent under Anthropic's zero-retention policy for API. Your audited URLs are not sent; only rule IDs and counts." />
        <Item k="Inngest (background job orchestration)" v="Receives audit IDs and worker metadata to run the audit pipeline. Does not receive audit report contents." />
        <Item k="International transfers" v="Some subprocessors process data in the United States (e.g. Resend, Anthropic). Transfers rely on the EU-US Data Privacy Framework and/or Standard Contractual Clauses." />
      </Section>

      <Section title="Your rights under GDPR / UK GDPR / CCPA">
        <Item k="Right of access" v="Request a copy of the personal data we hold about you. We respond within 30 days." />
        <Item k="Right to rectification" v="Correct inaccurate data via your account or by emailing us." />
        <Item k="Right to erasure" v={<span>Delete everything with <code className="font-mono text-foreground">DELETE /api/account</code> while signed in, or email us. Removes user record, audits, reports, and derived stats within 30 days.</span>} />
        <Item k="Right to portability" v={<span>Export your audit history as JSON via <code className="font-mono text-foreground">GET /api/account/export</code>.</span>} />
        <Item k="Right to restrict / object" v="Email us to restrict processing or object to legitimate-interest processing (rate-limit hashes, analytics)." />
        <Item k="Right to withdraw consent" v="Where processing is based on consent (e.g. marketing email, if you ever opted in), you can withdraw at any time without affecting lawful processing that already happened." />
        <Item k="Right to lodge a complaint" v="You may complain to your local EU data-protection authority. In France: CNIL (cnil.fr)." />
        <Item k="No automated decision-making" v="We do not take legal or similarly significant decisions about you via automated means." />
      </Section>

      <Section title="Security">
        <Item k="Transport" v="All connections use TLS 1.2 or higher. HSTS is enforced." />
        <Item k="At-rest encryption" v="Database and object storage are encrypted at rest by the hosting provider." />
        <Item k="Authentication" v="Magic links are single-use, short-lived (15 minutes), and bound to the requesting device. Google OAuth follows Google's security model." />
        <Item k="Session cookies" v="HttpOnly, Secure, SameSite=Lax. Signed with a server-held secret." />
        <Item k="Access control" v="Private audits are keyed to the user ID or anonymous session ID. Public audits are accessible by anyone who has the share URL (by design)." />
        <Item k="Breach notification" v="If we confirm a personal-data breach likely to result in risk to your rights, we will notify the relevant authority within 72 hours and you as soon as reasonably possible, per Art. 33–34 GDPR." />
      </Section>

      <Section title="Cookies and local storage">
        <Item k="Strictly necessary cookies" v="Session cookie (auth), anonymous session cookie, CSRF token. Exempt from consent under EU ePrivacy; these are required for the service to function." />
        <Item k="No analytics cookies" v="Our analytics is cookieless; we set no analytics or tracking cookies. We reuse the strictly-necessary anonymous session identifier as a first-party analytics profile key, setting no additional cookie." />
        <Item k="No advertising cookies" v="We set none." />
        <Item k="Third-party cookies from embeds" v="We do not embed third-party trackers. Turnstile may set a short-lived functional cookie during the bot challenge." />
        <Item k="Local storage" v="We use localStorage only to remember UI preferences (e.g. theme). No personal identifiers." />
      </Section>

      <Section title="Children">
        <Item k="Age" v="The service is not directed at children under 16. We do not knowingly collect data from children under 16. If you believe we have, email us and we will delete it." />
      </Section>

      <Section title="Changes to this policy">
        <Item k="Notifications" v="Material changes are announced at least 30 days before they take effect: via an in-app banner and, for signed-in users, email. Non-material edits (typos, clarifications) are made in place with an updated effective date." />
        <Item k="History" v="Previous versions of this policy are available on request." />
      </Section>

      <section className="mt-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Frequently asked
        </h2>
        <dl className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
          {FAQS.map((f) => (
            <div key={f.q} className="grid gap-2 border-b border-border/60 px-5 py-5 last:border-b-0">
              <dt className="text-sm font-semibold text-foreground">{f.q}</dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <SourcesSection
        sources={[
          {
            source: "gdpr",
            note: "Our lawful-basis, data-subject-rights, and retention commitments below track Articles 6, 15-22, and 5(1)(e) of the General Data Protection Regulation (EU) 2016/679, the regulation this policy is written to comply with.",
          },
        ]}
      />
      <LegalDisclaimer />
      <LegalFooter />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <dl className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
        {children}
      </dl>
    </section>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border/60 px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] sm:gap-6">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="text-sm text-foreground">{v}</dd>
    </div>
  );
}

function LegalDisclaimer() {
  return (
    <aside className="mt-12 rounded-[22px] border border-warning/30 bg-warning/5 p-5 text-xs leading-relaxed text-muted-foreground">
      <p className="text-sm font-medium text-foreground">Legal notice</p>
      <p className="mt-2">
        This document is a plain-language disclosure drafted by the pseolint team. It is not legal
        advice. If you are the operator, have counsel review this policy against the jurisdictions
        you serve before relying on it. If you are a user and believe any statement here is
        inaccurate or misleading, email us; that&apos;s a bug and we&apos;ll correct it.
      </p>
    </aside>
  );
}

function LegalFooter() {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link
        href="/terms"
        className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
      >
        Terms of Service
      </Link>
      <Link
        href="/limits"
        className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
      >
        Limits & fair-use
      </Link>
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Contact
      </a>
    </div>
  );
}
