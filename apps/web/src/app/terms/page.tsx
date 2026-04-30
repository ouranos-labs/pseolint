import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Terms of Service · pseolint",
  description:
    "The agreement between you and pseolint: acceptable use, what the service guarantees (and doesn't), billing, intellectual property, liability, and governing law.",
  alternates: { canonical: `${SITE_URL}/terms` },
};

const EFFECTIVE = "2026-04-20";
const CONTACT_EMAIL = "philippe.kam27@gmail.com";
const GOVERNING_LAW = "France";
const VENUE = "the courts of Paris, France";

export default function Terms() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Legal · terms of service
      </div>
      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        Terms of Service
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        These terms are the agreement between you and pseolint (engine v0.4.0;
        @pseolint/core v0.3.3, @pseolint/cli v0.3.1, @pseolint/mcp v0.3.1, all
        MIT-licensed at github.com/ouranos-labs/pseolint). By using the service,
        you accept them. We wrote them in plain English — if a clause seems
        unreasonable, email us and we&apos;ll explain or fix it. Pro
        subscriptions are $19/month or $228/year via Polar.sh, with a 14-day
        no-questions-asked refund.
      </p>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Terms scope clarification: this contract binds your usage of every surface labelled
        pseolint, whether browsed interactively from the dashboard, invoked headlessly via the
        REST API, scheduled through the GitHub Action runner, or wired into an editor through the
        Model Context Protocol bridge. Self-hosted CLI executions remain governed solely by the
        Apache-2.0 licence published alongside the source. Conflicts of interpretation between this
        agreement and the open-source licence resolve in favour of the licence for the affected
        component. Signed amendments require both parties to countersign in writing.
      </p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        Effective {EFFECTIVE} · contact{" "}
        <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </p>

      <Clause n="1" title="The service">
        pseolint is an automated SEO-risk auditing service. You submit a URL; we crawl a sample of
        that site&apos;s publicly reachable HTML, score it against a ruleset inferred from public
        Google SpamBrain guidance, and return a report. The service includes the website, API, CLI,
        GitHub Action, MCP server, and any other interface we provide under the pseolint name.
      </Clause>

      <Clause n="2" title="Who may use it">
        You must be at least 16 years old. You must have the legal capacity to enter into this
        agreement. If you are using pseolint for an organisation, you represent that you have
        authority to bind that organisation to these terms.
      </Clause>

      <Clause n="3" title="Your account">
        You are responsible for keeping your account credentials secure. Notify us immediately at{" "}
        <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>{" "}
        if you suspect unauthorised access. We are not liable for loss caused by compromised
        credentials that you failed to protect.
      </Clause>

      <Clause n="4" title="Acceptable use">
        <p>You agree <strong>not</strong> to:</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Submit URLs you do not own or do not have permission from the operator to audit.</li>
          <li>Use pseolint to conduct reconnaissance, vulnerability scanning, or any activity that could be construed as unauthorised access under the Computer Fraud and Abuse Act, the UK Computer Misuse Act, the French Loi Godfrain, or equivalent legislation.</li>
          <li>Attempt to circumvent rate limits, quotas, bot challenges, or IP restrictions — whether via multiple accounts, rotating proxies, or otherwise.</li>
          <li>Overload, disrupt, or degrade the service — including by submitting malformed requests, exceeding documented rate limits, or running stress tests without prior written permission.</li>
          <li>Reverse-engineer, decompile, or otherwise attempt to derive the source code of the hosted service (our CLI, core library, action, and MCP server are open source — see their respective licences).</li>
          <li>Use the service to build a competing product, or use the output to train machine-learning models you intend to distribute or sell, without a separate licence.</li>
          <li>Use the service in violation of any applicable export-control, sanctions, or anti-money-laundering law.</li>
          <li>Upload, link, or cause us to fetch content that is illegal, defamatory, or infringes a third party&apos;s intellectual property or privacy.</li>
        </ul>
        <p className="mt-3">
          We may suspend or terminate accounts that violate these rules, with or without notice
          depending on severity, and may cooperate with law-enforcement investigations as legally
          required.
        </p>
      </Clause>

      <Clause n="5" title="How we treat the sites you audit">
        Our crawler identifies itself, honours <code className="font-mono text-foreground">robots.txt</code>{" "}
        (both <code className="font-mono text-foreground">Disallow</code> and{" "}
        <code className="font-mono text-foreground">Crawl-delay</code>), respects{" "}
        <code className="font-mono text-foreground">Retry-After</code>, caps bandwidth and
        concurrency, and blocks private/internal addresses. Full operational detail is documented
        at <Link href="/limits" className="text-primary hover:underline">pseolint.dev/limits</Link>.
        Even so: you remain responsible for ensuring you have the right to audit the URLs you
        submit.
      </Clause>

      <Clause n="6" title="Public reports, leaderboards, and privacy of audited sites">
        <p>
          Anonymous and free-tier audits are <strong>public by default</strong>: the URL, host, and
          score are visible to anyone with the report link and may appear on the public{" "}
          <Link href="/leaderboard" className="text-primary hover:underline">leaderboard</Link>.
          Pro-tier audits are private by default.
        </p>
        <p className="mt-3">
          If you are the operator of an audited site and you want a report removed from the
          leaderboard or deleted from our storage, email{" "}
          <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{" "}
          with proof of domain control (DNS TXT record or link tag we specify). We will act within
          72 hours of verification. This is our good-faith takedown channel — no lawyers required.
        </p>
      </Clause>

      <Clause n="7" title="Intellectual property">
        <p>
          <strong>Your content.</strong> You retain all rights to the URLs, configuration, and any
          private notes you submit. By using the service, you grant us a limited licence to
          process, crawl, store, and display that content strictly to deliver the service to you.
          This licence ends when the underlying data is deleted under our retention policy or by
          your request.
        </p>
        <p className="mt-3">
          <strong>Audited content.</strong> We do not claim ownership of the HTML we fetch. We
          process it only to produce your report, and we store it only within the retention windows
          described at <Link href="/limits" className="text-primary hover:underline">/limits</Link>.
        </p>
        <p className="mt-3">
          <strong>Our content.</strong> The pseolint brand, website, documentation, scoring
          methodology, and hosted service are ours. The CLI, core library, Action, and MCP server
          are open source under their respective licences (see the GitHub repository).
        </p>
        <p className="mt-3">
          <strong>Feedback.</strong> If you send us feedback or feature requests, you grant us a
          perpetual, royalty-free licence to use it without obligation. We do not claim any
          resulting IP in your own work.
        </p>
      </Clause>

      <Clause n="8" title="Billing, renewal, and refunds">
        <p>
          Subscriptions are billed via Polar.sh, which acts as our merchant of record and handles
          tax collection (including EU VAT, UK VAT, and US sales tax where applicable). Payment
          terms, supported methods, and invoicing are governed by Polar&apos;s checkout. We do not
          process or store your card data.
        </p>
        <p className="mt-3">
          Subscriptions renew automatically at the end of each billing period unless cancelled
          beforehand through your Polar customer portal. Cancellation takes effect at the end of
          the current period; you keep Pro access until then.
        </p>
        <p className="mt-3">
          <strong>Refund policy.</strong> We offer a no-questions-asked refund within 7 days of
          any charge — including renewals. Email{" "}
          <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{" "}
          and we&apos;ll process it within 5 business days. EU/UK consumers retain any mandatory
          statutory right of withdrawal.
        </p>
        <p className="mt-3">
          Price changes apply at the next renewal and are announced at least 30 days in advance.
        </p>
      </Clause>

      <Clause n="9" title="Service level &mdash; no warranty">
        <p>
          We work hard on uptime but we do not guarantee any specific SLA on free or Pro tiers.
          The service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>, without warranties of any kind,
          whether express or implied — including merchantability, fitness for a particular
          purpose, non-infringement, or uninterrupted operation — to the fullest extent permitted
          by applicable law.
        </p>
        <p className="mt-3">
          Audit scores are informational heuristics derived from public documentation about
          Google SpamBrain. They are not a verdict from Google, they do not predict ranking
          outcomes, and following our findings does not guarantee any particular SEO result.
        </p>
      </Clause>

      <Clause n="10" title="Limitation of liability">
        <p>
          To the maximum extent permitted by applicable law, pseolint and its operators will not
          be liable for any indirect, incidental, special, consequential, exemplary, or punitive
          damages — including lost profits, lost revenue, lost data, loss of goodwill, business
          interruption, cost of substitute services, or damages relating to decisions made on the
          basis of an audit report — arising out of or related to your use of the service, even if
          we have been advised of the possibility of such damages.
        </p>
        <p className="mt-3">
          Our aggregate liability for any claim arising out of or related to this agreement or the
          service, regardless of the form of action, is capped at the greater of (a) the fees you
          paid us in the three months preceding the event giving rise to the claim, or (b) fifty
          euros (€50).
        </p>
        <p className="mt-3">
          Nothing in this section limits liability that cannot be lawfully excluded, including
          liability for death or personal injury caused by negligence, fraud, or intentional
          misconduct, or any non-waivable statutory rights of consumers.
        </p>
      </Clause>

      <Clause n="11" title="Indemnification">
        You agree to defend, indemnify, and hold pseolint harmless from any third-party claim
        arising from (i) your breach of these terms, (ii) URLs you submitted without authorisation,
        or (iii) your misuse of report output (including using our findings to defame an audited
        party). We will notify you of any such claim, cooperate reasonably in the defence, and
        will not settle without your consent where your rights are materially affected.
      </Clause>

      <Clause n="12" title="Suspension and termination">
        We may suspend or terminate your access if you materially violate these terms, if we are
        required to by law, or if we reasonably believe your account has been compromised. You may
        terminate at any time by cancelling your subscription and deleting your account. On
        termination, sections that by their nature should survive — ownership, liability,
        indemnification, governing law — survive.
      </Clause>

      <Clause n="13" title="Changes to these terms">
        We may update these terms from time to time. Material changes are announced at least 30
        days before they take effect via an in-app banner and, for signed-in users, email.
        Continued use after the effective date constitutes acceptance. If you do not accept a
        material change, you may close your account and receive a pro-rated refund of any unused
        prepaid period.
      </Clause>

      <Clause n="14" title="Governing law and venue">
        These terms are governed by the laws of {GOVERNING_LAW}, without regard to its
        conflict-of-laws rules. Exclusive jurisdiction lies with {VENUE}, except where mandatory
        local consumer-protection law grants you the right to bring proceedings in the courts of
        your country of residence.
      </Clause>

      <Clause n="15" title="Force majeure">
        Neither party is liable for failure or delay caused by events beyond reasonable control —
        including natural disasters, acts of war or terrorism, civil disturbance, failures of
        third-party infrastructure (hosting providers, internet backbones), government action, or
        labour disputes — provided the affected party gives prompt notice and resumes performance
        as soon as reasonably possible.
      </Clause>

      <Clause n="16" title="Miscellaneous">
        <p>
          <strong>Entire agreement.</strong> These terms, together with the{" "}
          <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link> and{" "}
          <Link href="/limits" className="text-primary hover:underline">Limits & fair-use</Link>{" "}
          page, are the complete agreement between you and us on their subject.
        </p>
        <p className="mt-3">
          <strong>Severability.</strong> If any clause is held unenforceable, the remaining
          clauses remain in full effect.
        </p>
        <p className="mt-3">
          <strong>No waiver.</strong> Failure to enforce a provision is not a waiver.
        </p>
        <p className="mt-3">
          <strong>Assignment.</strong> You may not assign these terms without our consent. We may
          assign them to a successor in a merger, acquisition, or sale of assets.
        </p>
        <p className="mt-3">
          <strong>Notices.</strong> We may send legal notices to the email on your account. Send
          notices to us at{" "}
          <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p className="mt-3">
          <strong>Language.</strong> This English version is authoritative. Translations, if any,
          are for convenience only.
        </p>
      </Clause>

      <LegalDisclaimer />
      <LegalFooter />
    </main>
  );
}

function Clause({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="flex items-baseline gap-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="font-mono text-primary">{n}.</span>
        <span>{title}</span>
      </h2>
      <div className="mt-3 rounded-[22px] border border-border/60 bg-card/40 p-5 text-sm leading-relaxed text-foreground/90 backdrop-blur-sm">
        {typeof children === "string" ? <p>{children}</p> : children}
      </div>
    </section>
  );
}

function LegalDisclaimer() {
  return (
    <aside className="mt-12 rounded-[22px] border border-warning/30 bg-warning/5 p-5 text-xs leading-relaxed text-muted-foreground">
      <p className="text-sm font-medium text-foreground">Legal notice</p>
      <p className="mt-2">
        This document is a plain-language draft prepared by the pseolint team. It is not legal
        advice and has not been reviewed by counsel in every jurisdiction where the service is
        offered. Operators: have a qualified lawyer review these terms against the laws of the
        jurisdictions you serve — particularly the liability, indemnification, consumer-rights,
        and governing-law clauses — before relying on them.
      </p>
    </aside>
  );
}

function LegalFooter() {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link
        href="/privacy"
        className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
      >
        Privacy Policy
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
