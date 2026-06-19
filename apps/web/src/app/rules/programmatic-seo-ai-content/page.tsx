import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/rules/programmatic-seo-ai-content`;

export const metadata: Metadata = {
  title: "AI Content Generation for Programmatic SEO · pseolint",
  description:
    "Scale AI copy safely. Learn how to generate programmatic SEO content using dynamic prompt frameworks that bypass Google SpamBrain filters.",
  alternates: { canonical: url },
  openGraph: {
    title: "AI Content Generation for Programmatic SEO Sites",
    description:
      "Scale AI copy safely. Learn how to generate programmatic SEO content using dynamic prompt frameworks that bypass Google SpamBrain filters.",
    url,
    type: "article",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Content Generation for Programmatic SEO",
    description:
      "Discover the step-by-step framework to generate variable AI content that survives Google's Helpful Content and SpamBrain updates.",
  },
};

const FAQS = [
  {
    q: "Does Google penalize AI content?",
    a: "No. Google's official spam policy states that using AI or automation to generate content is fine, provided it is created to help users rather than manipulate search rankings. Unhelpful, thin, or recycled content gets demoted regardless of how it was written.",
  },
  {
    q: "What is lexical diversity and why does it matter?",
    a: "Lexical diversity is the variety of vocabulary used in text. If all 10,000 pages of your programmatic campaign share the exact same sentence structures and vocabulary tokens, SpamBrain identifies the layout as a low-value template.",
  },
  {
    q: "How do I inject E-E-A-T into automated AI content?",
    a: "Ensure your prompts instruct LLMs to reference real-world metrics, localized data points, or practical guidelines. Include a schema Person block mapping your content creators and experts.",
  },
  {
    q: "Why is a flat prompt template risky for programmatic SEO?",
    a: "If you send the same system prompt to an LLM with only a single keyword swapped (e.g. 'write an intro about [city]'), the LLM outputs paragraphs with identical lengths, transitions, and flow. This flags your pages as near-duplicates.",
  },
];

const PROMPT_STEPS = [
  {
    name: "Define Core Entity Data",
    text: "Gather localized data, prices, reviews, or facts for your database. Do not rely on the LLM to hallucinate these facts; pass them as structured inputs.",
  },
  {
    name: "Build Dynamic Prompt Templates",
    text: "Create prompts featuring conditional instructions. Switch system commands based on entity type to force the model to adopt different outlines and tones.",
  },
  {
    name: "Configure Multi-Modal Writing Guidelines",
    text: "Instruct the LLM to use varied styles. Command it to alternate between bulleted lists, comparative tables, and paragraphs to create structural diversity.",
  },
  {
    name: "Perform Local SimHash Similarity Audits",
    text: "Generate a sample batch of pages and compare their content using 64-bit SimHash. Ensure sibling similarity scores stay under 85% before executing full generation cycles.",
  },
  {
    name: "Inject Machine-Readable Structured Metadata",
    text: "Embed valid schema.org metadata graphs (FAQPage, HowTo, Product) corresponding to the generated text, establishing E-E-A-T indicators.",
  },
];

export default function ProgrammaticSeoAiContentPage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "AI Content Generation for Programmatic SEO",
    description: "Scale AI copy safely. Learn how to generate programmatic SEO content using dynamic prompt frameworks that bypass Google SpamBrain filters.",
    url,
    inLanguage: "en",
    about: { "@type": "Thing", name: "AI Content Programmatic SEO" },
    isPartOf: {
      "@type": "WebSite",
      name: "pseolint",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Ouranos Labs",
      url: SITE_URL,
    },
    author: {
      "@type": "Person",
      name: "Philippe Kam",
      jobTitle: "Lead SEO Engineer",
      knowsAbout: ["Search Engine Optimization", "Template Engineering", "Large Language Models"],
      sameAs: [
        "https://x.com/Pipolmpk",
        "https://linkedin.com/in/philippekam"
      ]
    },
  };

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Generate Compliant AI Content for pSEO",
    description: "5 steps to configure dynamic prompting and validation pipelines to scale helpful AI content.",
    step: PROMPT_STEPS.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      itemListElement: [
        {
          "@type": "HowToDirection",
          text: s.text,
        },
      ],
    })),
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      {/* Breadcrumbs */}
      <nav className="text-xs text-muted-foreground">
        <Link href="/rules" className="hover:text-foreground hover:underline">
          Rules
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">AI content generation for pSEO</span>
      </nav>

      {/* Hero */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          AI & Automation Framework · Content Quality
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          Generating Safe AI Content for Programmatic SEO
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Using artificial intelligence to write content is the fastest way to build programmatic SEO directories.
          However, scaling without a structured quality framework will trigger Google&apos;s core spam updates.
          Google&apos;s ML classifiers (SpamBrain) analyze content clusters to flag unoriginal, monotonous, and
          boilerplated text. Discover how to build dynamic prompt structures that output high-quality,
          highly variable pages that rank.
        </p>
      </section>

      {/* Five Prompt Steps */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          The Safe Generation Pipeline
        </h2>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 text-muted-foreground">
          {PROMPT_STEPS.map((s, i) => (
            <div key={i} className="rounded-[22px] border border-border/70 bg-card/40 p-5 flex flex-col gap-2">
              <span className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 border border-primary/30 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <h3 className="text-xs font-bold text-foreground mt-1">{s.name}</h3>
              <p className="text-[10px] leading-relaxed text-muted-foreground mt-0.5">{s.text}</p>
            </div>
          ))}
        </ol>
      </section>

      {/* In-Depth Technical Content */}
      <section className="mt-14 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Dynamic Prompting vs. Simple Mail-Merge Templates
          </h2>
          <p>
            In the early days of programmatic SEO, operators used simple mail-merge templates (e.g. &quot;Choose the best
            [service] in [city] for your needs&quot;) and swapped keywords. Modern search engines easily detect this.
            Many builders then switched to LLM APIs but committed the same error by sending static prompts:
          </p>
          <pre className="rounded-lg bg-red-950/20 border border-red-500/20 p-4 overflow-x-auto text-xs font-mono text-red-400 mb-4">
{`// BAD: Flat prompt pattern producing duplicate layouts
const prompt = \`Write a 200-word introduction about plumbing services in \${city}.\`;`}
          </pre>
          <p className="mt-3">
            Because LLMs default to highly uniform sentence structures, this produces pages that share an 85%+ SimHash
            similarity score, triggering canonicalization merges. Instead, use a **Dynamic Prompting Wrapper**:
          </p>
          <pre className="rounded-lg bg-card/60 p-4 border border-border/70 overflow-x-auto text-xs font-mono text-foreground leading-normal">
{`// GOOD: Dynamic prompts leveraging database attributes and structured tone shifts
function buildPrompt(entity) {
  const styles = ["analytical", "straightforward", "procedural", "conversational"];
  const selectedStyle = styles[entity.id % styles.length];

  return \`
    You are an expert plumbing consultant.
    Write an outline about plumbing challenges in \${entity.cityName}.
    Use a \${selectedStyle} writing tone.
    Reference these actual data points: local hardness score is \${entity.waterHardness},
    and local median pricing is \${entity.medianPrice}.
    Do not use generic transitional phrases.
  \`;
}`}
          </pre>

          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-10">
            Establishing Lexical Diversity & E-E-A-T
          </h2>
          <p>
            Google&apos;s quality systems evaluate content helpfulness by searching for first-person experience, original data, and author metadata. To satisfy these E-E-A-T signals programmatically:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>Inject Actual Reviews:</strong> Feed real user reviews or practitioner listings from your database directly into the context window.</li>
            <li><strong>Enforce Structuring:</strong> Command the LLM to return data in specific formats, such as lists, definition glossaries, or comparisons, based on local metrics.</li>
            <li><strong>Audit Before Deploying:</strong> Integrate the CLI tool `pseolint` in your compilation scripts to automatically check duplicate metrics and thin content warnings.</li>
          </ul>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">Frequently Asked Questions</h2>
        <dl className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
          {FAQS.map((f, i) => (
            <div key={i} className="grid gap-2 border-b border-border/60 p-6 last:border-b-0">
              <dt className="text-sm font-semibold text-foreground">{f.q}</dt>
              <dd className="text-xs leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Sources */}
      <SourcesSection
        sources={[
          {
            source: "scaledContent",
            note: "Google's scaled content policies outline the boundaries of unhelpful, auto-generated boilerplate templates.",
          },
          {
            source: "helpfulContent",
            note: "Helpful content guidelines establish substance and lexical diversity signals that Googlebot checks.",
          },
          {
            source: "spamPolicies",
            note: "Google's official spam policy updates clarify search standards regarding automated content scaling.",
          },
        ]}
      />

      {/* CTA Box */}
      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Are your AI-generated templates compliant with Google&apos;s latest quality updates? Run a pre-flight scan
          to identify similarity and thin-content flags instantly.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Audit generated content
          </Link>
          <Link
            href="/rules"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            All rules guides
          </Link>
        </div>
      </div>

      {/* Schema scripts */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}
