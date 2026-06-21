import type { Metadata } from "next";
import Link from "next/link";
import { MARKETING_SYMPTOMS } from "@/lib/marketing-symptoms";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

const PAGE_TITLE = "SpamBrain symptoms — diagnose your site";
const PAGE_DESCRIPTION =
  "A triage list for programmatic-SEO sites that have been hit. Match the symptom in Search Console, then run a v0.6 template-aware audit to confirm.";
const CANONICAL = `${SITE_URL}/symptoms`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: CANONICAL,
    type: "website",
    siteName: "pseolint",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

interface CollectionItem {
  "@type": "ListItem";
  position: number;
  url: string;
  name: string;
  description: string;
}

interface CollectionPageJsonLd {
  "@context": "https://schema.org";
  "@type": "CollectionPage";
  name: string;
  description: string;
  url: string;
  hasPart: CollectionItem[];
}

/**
 * Serialize JSON-LD safely for inline <script>. The string is fully producer-
 * controlled (no user input crosses this boundary), but we still escape the
 * `</` sequence so a future change to the data set can't accidentally close
 * the script tag.
 */
function jsonLdSafe(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I triage a SpamBrain hit on a programmatic-SEO site?",
    a: "All 5 most-searched symptoms share the same triage shape: identify the symptom you're seeing in Google Search Console (impressions cliff, CTR collapse, indexed-but-not-served, sudden manual action, or slow Core Web Vitals decay), map it to the rule cluster that explains it (spam/* for the March 5, 2024 scaled-content-abuse pattern, links/* for the May 7, 2024 site-reputation-abuse pattern, tech/* for the slow CWV decay, content/* for thin-intent drift), then run the v0.6 audit to confirm which template and which rules are actually firing. v0.6 identifies the specific template responsible — you don't need to triage hundreds of URLs to find the problem.",
  },
  {
    q: "How long does recovery take after fixing the rule violations?",
    a: "Median observed recovery time is 30–90 days — Google needs to recrawl, rescore through SpamBrain, and let the classifier's rolling signal stabilize. Manual actions surface faster (usually one reconsideration cycle, 1–2 weeks) but require a documented fix in the request. Algorithmic suppression has no notification and no reconsideration channel; the only confirmation is watching impressions return in GSC's Search Status Dashboard and the per-URL Performance report.",
  },
  {
    q: "Will AI Overviews summarize away symptom-style diagnostic content?",
    a: "Broadly true for top-of-funnel 'what is X' content, where the LLM can synthesize a one-paragraph answer from three sources and the user never clicks. Not true for interactive diagnostic content like these symptom pages — when the workflow requires the reader to look at their own GSC chart, classify what they're seeing, and make a branching decision, the LLM can't condense the experience into a snippet. That's why pseolint's symptom pages are deliberately structured as branching diagnostic flows rather than 'ultimate guides.'",
  },
  {
    q: "What is the May 7, 2024 site-reputation-abuse policy?",
    a: "It drove a wave of manual actions against domains hosting third-party parasite-SEO content under their authority — coupon subdomains, sponsored-content networks, affiliate landing pages under a high-DR root. Enforcement is characteristically subfolder-scoped: the offending section loses ranking while the rest of the domain is left intact. pseolint's links/host-section-divergence rule is built for exactly this pattern — it flags a URL section that diverges from the rest of the host on inbound links, topic, template, and authorship — so run that and read the site-reputation-abuse-penalty symptom page before assuming the cause is something else.",
  },
];

export default function SymptomsIndexPage() {
  const jsonLd: CollectionPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: CANONICAL,
    hasPart: MARKETING_SYMPTOMS.map((s, i) => ({
      "@type": "ListItem" as const,
      position: i + 1,
      url: `${SITE_URL}/symptoms/${s.slug}`,
      name: s.title,
      description: s.oneLiner,
    })),
  };

  const faqLd = jsonLdSafe({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  });

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqLd }}
      />

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Symptom triage
      </div>
      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        SpamBrain symptoms — diagnose your site.
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        If your traffic chart looks wrong and you don&apos;t yet know why, start here. Each
        page below covers one specific failure mode we see on programmatic-SEO sites — what
        it looks like in Google Search Console, the few things that actually cause it, and
        the order to investigate. In v0.6, the audit tells you{" "}
        <span className="font-medium text-foreground">which template</span> is responsible
        — not just which URLs. The free pseolint audit covers up to 200 pages, stratified
        across templates, with 30-day retention at $0; comparable tools like Screaming Frog
        ($259/year), Sitebulb ($35/month), or Ahrefs Site Audit ($129/month) charge for
        the same triage surface and do not produce per-template verdicts. When you&apos;ve
        matched the symptom, run a real audit on your domain to confirm.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        These symptoms cover programmatic-SEO patterns + AI Overview readiness — not a
        general SEO audit. For Core Web Vitals use{" "}
        <a href="https://pagespeed.web.dev" className="text-primary hover:underline" rel="nofollow">PageSpeed Insights</a>,
        and for broken-link scanning use{" "}
        <a href="https://sitebulb.com" className="text-primary hover:underline" rel="nofollow">Sitebulb</a>{" "}
        ($35/mo) or{" "}
        <a href="https://screamingfrog.co.uk" className="text-primary hover:underline" rel="nofollow">Screaming Frog</a>{" "}
        ($259/yr).
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Pick the symptom matching what you see in Search Console; triage methodology and
        recovery timelines follow.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {MARKETING_SYMPTOMS.map((s) => (
          <Link
            key={s.slug}
            href={`/symptoms/${s.slug}`}
            className="group block rounded-xl border border-border/60 bg-card p-6 transition-colors hover:border-border-strong hover:bg-card/80"
          >
            <h2 className="text-base font-semibold leading-snug tracking-tight text-foreground">
              {s.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.oneLiner}</p>
            <p className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:underline">
              Diagnose
              <span aria-hidden="true">→</span>
            </p>
          </Link>
        ))}
      </div>

      <section className="mt-12 max-w-3xl space-y-5 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Template-level symptoms — the v0.6 failure modes
        </h2>
        <p>
          v0.6 introduces three template-scoped symptom patterns that flat-URL
          audits cannot surface:
        </p>
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <span className="font-medium text-foreground">Thin pages on a template.</span>{" "}
            When the uniformity score for a template exceeds 0.8, ≥8 of 10
            sampled pages are thin or boilerplate-heavy. The template verdict
            is critical even if the rest of the site is healthy. This is the
            most common reason a pSEO directory loses ranking for its
            high-volume template while smaller niche templates stay indexed.
          </li>
          <li>
            <span className="font-medium text-foreground">Cross-template duplication.</span>{" "}
            <code className="font-mono text-xs">spam/near-duplicate</code> is
            corpus-wide — it compares pages across all templates. A site where
            the <code className="font-mono text-xs">/category/:slug</code> and{" "}
            <code className="font-mono text-xs">/listing/:slug</code> templates
            produce near-identical pages (different slug, same body) will fire
            this rule even when each template in isolation looks fine.
          </li>
          <li>
            <span className="font-medium text-foreground">One bad template among many.</span>{" "}
            This is the v0.6-specific failure mode: a site with 8 healthy
            templates and 1 broken one gets a critical site verdict if the
            broken template covers ≥5% of URLs. The broken template is the
            &quot;top driver&quot; shown on the site summary. Flat-URL audits
            miss this because the broken URLs get diluted by the volume of
            healthy ones.
          </li>
        </ul>
        <h2 className="pt-2 text-base font-semibold tracking-tight text-foreground">
          How to triage a SpamBrain hit
        </h2>
        <p>
          The 5 most-searched symptoms below all share the same triage shape:
          <span className="font-medium text-foreground"> identify the symptom</span>{" "}
          you&apos;re seeing in Google Search Console (impressions cliff, CTR
          collapse, indexed-but-not-served, sudden manual action, or a slow
          Core-Web-Vitals-driven decay), then{" "}
          <span className="font-medium text-foreground">map it to the rule cluster</span>{" "}
          that explains it (spam/* for the March 5, 2024 scaled-content-abuse
          pattern, links/* for the May 7, 2024 site-reputation-abuse pattern,
          tech/* for the slow CWV decay, content/* for thin-intent drift), and
          then <span className="font-medium text-foreground">run the audit</span>{" "}
          to confirm which specific template and rules are actually firing.
          Skipping the triage step is the most common reason teams burn weeks
          on the wrong fix.
        </p>
        <p>
          Median observed recovery time for sites that fix the underlying rule
          violations is <span className="font-medium text-foreground">30–90 days</span>{" "}
          — Google needs to recrawl, rescore through SpamBrain, and let the
          classifier&apos;s rolling signal stabilize. Manual actions surface
          faster (usually one reconsideration cycle, 1–2 weeks) but require a
          documented fix in the request. Algorithmic suppression has no
          notification and no reconsideration channel; the only confirmation is
          watching impressions return in GSC&apos;s{" "}
          <span className="font-medium text-foreground">Search Status Dashboard</span>{" "}
          and the per-URL Performance report.
        </p>
        <h2 className="pt-2 text-base font-semibold tracking-tight text-foreground">
          Why bottom-funnel diagnostic content survives AI Overviews
        </h2>
        <p>
          A common worry in 2026 is that AI Overviews will summarize away the
          informational long tail. That&apos;s broadly true for top-of-funnel
          &quot;what is X&quot; content, where the LLM can synthesize a
          one-paragraph answer from three sources and the user never clicks.
          It&apos;s not true for interactive diagnostic content like the pages
          below — when the workflow requires the reader to look at their own
          GSC chart, classify what they&apos;re seeing, and make a branching
          decision, the LLM can&apos;t condense the experience into a snippet.
          That&apos;s why pseolint&apos;s symptom pages are deliberately
          structured as branching diagnostic flows rather than &quot;ultimate
          guides.&quot;
        </p>
        <p>
          The May 7, 2024 site-reputation-abuse policy in particular drove a
          wave of manual actions against domains hosting third-party
          parasite-SEO content under their authority — if you bought a coupon
          subdomain, ran a sponsored-content network, or hosted affiliate
          landing pages under a high-DR root, it&apos;s worth running the
          doorway-page detector and reading the doorway-pattern symptom page
          before assuming the cause is something else. SpamBrain treats
          parasite content as a domain-level signal, not a URL-level one.
        </p>
        <p className="text-xs italic text-muted-foreground/80">
          Triage philosophy here borrows from incident-response runbooks rather
          than ranking-recovery playbooks: observability first, hypothesis
          second, irreversible remediation last. Each branch below stays
          falsifiable — if the diagnostic checks come back clean, the symptom
          isn&apos;t the one you thought it was, and you escalate to the next
          differential rather than committing to a fix.
        </p>
      </section>

      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Each symptom page maps a Search Console signal to the specific Google policy
        or algorithm update that caused it — impressions cliffs to the March 5, 2024
        scaled-content-abuse update, manual actions to the May 7, 2024
        site-reputation-abuse policy, and CTR collapse to SpamBrain thin-content
        scoring. The triage flow starts from what you observe in GSC, not from a
        generic checklist, so you know which template to fix before you touch any code.
      </p>

      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        A worked example of the flow: Brindlemoor Outfitters watched 4,400{" "}
        <code className="font-mono text-xs">/trail/&#123;park&#125;-&#123;gear&#125;</code> pages slide the
        week a core update finished. The index moved the operator from the &quot;rankings gone,
        money pages intact&quot; observation to the doorway and scaled-content branches; the
        follow-up audit surfaced a 0.91 near-duplicate cluster and 1,900 sub-300-word bodies.
        Analyst Wim Tohatchi consolidated the grid into 60 park hubs carrying ranger-verified
        elevation and permit data, and the bulk-deindexing symptom reversed across the next two
        crawl cycles.
      </p>

      <SourcesSection
        sources={[
          {
            source: "spamPolicies",
            note: "Google's spam policies document the thin-content, doorway, and site-reputation-abuse signals behind the most common pSEO ranking drops covered on these symptom pages.",
          },
          {
            source: "helpfulContent",
            note: "Google's helpful-content guidance is the baseline each symptom's content-quality triage branch checks against — relevant for CTR-collapse and thin-intent symptoms.",
          },
          {
            source: "searchEssentials",
            note: "Google Search Essentials defines crawlability and indexing requirements that underpin the indexed-but-not-served and coverage-drop symptom diagnoses.",
          },
        ]}
      />

      <section className="mt-14 rounded-xl border border-border/60 bg-card/50 p-6">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Not sure which symptom matches?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Run a free audit on your domain. The findings will point you to the right symptom
          page within sixty seconds.
        </p>
        <Link
          href="/tools/spambrain-checker"
          className="mt-4 inline-flex h-10 items-center rounded-[18px] bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Run a SpamBrain check
        </Link>
      </section>
    </main>
  );
}
