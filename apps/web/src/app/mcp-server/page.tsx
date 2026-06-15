import { type Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");
const REMOTE_URL = "https://pseolint.dev/mcp";

export const metadata: Metadata = {
  title: "pseolint MCP server — audit pSEO sites from Claude, Cursor & any MCP client",
  description:
    "Connect pseolint to your AI coding assistant. Paste the hosted URL for a zero-install remote server, or run the open-source stdio package. Penalty-risk audits, fix manifests, no signup.",
  alternates: { canonical: `${SITE_URL}/mcp-server` },
  openGraph: {
    title: "pseolint MCP server — penalty-risk audits inside your AI assistant",
    description:
      "Zero-install remote endpoint (paste one URL) or the open-source stdio package. Audit programmatic SEO sites for SpamBrain risk without leaving Claude or Cursor.",
    url: `${SITE_URL}/mcp-server`,
    type: "website",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "pseolint MCP server",
    description:
      "Audit programmatic SEO sites for SpamBrain risk from Claude, Cursor, or any MCP client. Zero-install remote URL or open-source stdio package.",
  },
};

/**
 * Escape `</` inside JSON-LD so a stray closing tag in a string can't terminate
 * the surrounding <script> block. Inputs here are compile-time-static, but
 * sanitizing keeps the helper safe to reuse.
 */
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "What's the difference between the remote and the local (stdio) server?",
    a: "Same engine, different delivery. The remote server is hosted at https://pseolint.dev/mcp — you paste one URL into your MCP client, nothing to install, and it serves the three read-only audit tools. The local stdio server runs on your machine via npx @pseolint/mcp; it also exposes the AI-orchestrated audit tool that produces a fix manifest with concrete patches. Use remote for the fastest start, stdio for the orchestrate tool or fully offline/local runs.",
  },
  {
    q: "Is it free? Do I need an account?",
    a: "The remote server's three read-only tools are free and need no signup — anonymous use is rate-limited per IP. Creating a free API key in your dashboard raises those limits. The open-source stdio package is free and unlimited. The orchestrate tool (stdio/CLI) calls a paid LLM provider with your own API key.",
  },
  {
    q: "Which clients does this work with?",
    a: "Any MCP client. Clients that support remote Streamable HTTP (e.g. Cursor) take the URL directly. Stdio-only clients like Claude Desktop reach the remote server through the mcp-remote bridge, or you can install the stdio package locally. Setup snippets for each are above.",
  },
  {
    q: "What does the audit actually check?",
    a: "pseolint runs 44 rules mapped to documented Google SpamBrain signals (thin content, doorway patterns, near-duplicate clusters, boilerplate ratio, scaled-content density, site-reputation abuse) plus answer-engine-optimization checks for AI Overviews, Perplexity, and ChatGPT search. It audits by template, returning a per-template verdict and a 0–100 risk score, not a flat per-URL list.",
  },
  {
    q: "Is it safe to point it at any URL?",
    a: "Yes. Every tool runs in SaaS-safe mode: a DNS-validated guard blocks requests to private/internal IP ranges (SSRF protection), fetch sizes are capped, and robots.txt is honored. The remote endpoint can't be turned into a proxy to internal hosts.",
  },
  {
    q: "What are the four tools?",
    a: "pseolint_audit_site (crawl + verdict + risk score + findings), pseolint_explain_score (why the verdict is what it is, quick wins first), pseolint_check_page_technical (per-page canonical/OG/JSON-LD/meta checks), and pseolint_orchestrate_audit (LLM-driven deep audit that emits a paste-able fix manifest — stdio/CLI only for now).",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "pseolint MCP server",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any (MCP client)",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  url: `${SITE_URL}/mcp-server`,
};

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-[14px] border border-border/60 bg-card/60 p-4 text-xs leading-relaxed">
      <code className="font-mono">{children}</code>
    </pre>
  );
}

export default function McpServerPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(softwareJsonLd) }}
      />

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        MCP server · zero-install or open-source
      </div>
      <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
        pseolint MCP server
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Audit programmatic SEO sites for SpamBrain and answer-engine risk without
        leaving your AI assistant. Paste one URL for the hosted remote server, or
        run the open-source stdio package locally. Both speak the{" "}
        <a
          href="https://modelcontextprotocol.io"
          className="text-foreground underline decoration-dotted underline-offset-2"
          rel="noopener"
        >
          Model Context Protocol
        </a>
        , so they drop into Claude, Cursor, and any MCP-capable client.
      </p>

      {/* Remote — primary */}
      <section className="mt-8 rounded-[22px] border border-border/60 bg-card/40 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-success">
          Recommended · zero install
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Remote server</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          One hosted endpoint — no Node, no <code className="font-mono text-xs">npx</code>, no
          local setup. Serves the three read-only audit tools. Anonymous use is
          rate-limited; a free API key raises your limits.
        </p>
        <CodeBlock>{REMOTE_URL}</CodeBlock>

        <h3 className="mt-5 text-sm font-semibold text-foreground">
          Cursor &amp; clients with native remote support
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Add to your MCP config (e.g. <code className="font-mono text-xs">~/.cursor/mcp.json</code>):
        </p>
        <CodeBlock>{`{
  "mcpServers": {
    "pseolint": {
      "url": "${REMOTE_URL}"
    }
  }
}`}</CodeBlock>

        <h3 className="mt-5 text-sm font-semibold text-foreground">
          Claude Desktop (stdio-only) — via the mcp-remote bridge
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Add to <code className="font-mono text-xs">claude_desktop_config.json</code>:
        </p>
        <CodeBlock>{`{
  "mcpServers": {
    "pseolint": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${REMOTE_URL}"]
    }
  }
}`}</CodeBlock>

        <h3 className="mt-5 text-sm font-semibold text-foreground">Using an API key (higher limits)</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Create a key under{" "}
          <Link
            href="/dashboard/settings/account"
            className="text-foreground underline decoration-dotted underline-offset-2"
          >
            dashboard → account
          </Link>{" "}
          and send it as a Bearer token. Native config:
        </p>
        <CodeBlock>{`{
  "mcpServers": {
    "pseolint": {
      "url": "${REMOTE_URL}",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
    }
  }
}`}</CodeBlock>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Bridge form: <code className="font-mono text-xs">npx -y mcp-remote {REMOTE_URL} --header &quot;Authorization: Bearer YOUR_KEY&quot;</code>
        </p>
      </section>

      {/* stdio — secondary */}
      <section className="mt-6 rounded-[22px] border border-border/60 bg-card/40 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Open source · power users
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Local stdio server</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Runs on your machine from the open-source{" "}
          <a
            href="https://www.npmjs.com/package/@pseolint/mcp"
            className="text-foreground underline decoration-dotted underline-offset-2"
            rel="noopener"
          >
            @pseolint/mcp
          </a>{" "}
          package. Adds the AI-orchestrated <code className="font-mono text-xs">pseolint_orchestrate_audit</code>{" "}
          tool, which produces a fix manifest of concrete, paste-able patches.
        </p>
        <CodeBlock>{`{
  "mcpServers": {
    "pseolint": {
      "command": "npx",
      "args": ["-y", "@pseolint/mcp"]
    }
  }
}`}</CodeBlock>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The orchestrate tool calls a paid LLM provider — set{" "}
          <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> (or another supported provider key)
          in the server&apos;s environment. The other three tools run without it.
        </p>
      </section>

      {/* What you get */}
      <section className="mt-6 grid gap-4 rounded-[22px] border border-border/60 bg-card/40 p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Remote vs. local
          </p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-foreground">
            <li>
              <span className="font-medium">Remote:</span> zero install, 3 read-only tools,
              anonymous (rate-limited) or keyed.
            </li>
            <li>
              <span className="font-medium">Local:</span> all 4 tools incl. orchestrate, fully
              offline, unlimited.
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            The tools
          </p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-foreground">
            <li><code className="font-mono text-xs">pseolint_audit_site</code> — verdict + risk + findings</li>
            <li><code className="font-mono text-xs">pseolint_explain_score</code> — why, quick wins first</li>
            <li><code className="font-mono text-xs">pseolint_check_page_technical</code> — per-page checks</li>
            <li><code className="font-mono text-xs">pseolint_orchestrate_audit</code> — fix manifest (local)</li>
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Frequently asked</h2>
        <dl className="mt-4 space-y-5">
          {FAQS.map((f) => (
            <div key={f.q} className="rounded-[18px] border border-border/50 bg-card/30 p-4">
              <dt className="text-sm font-medium text-foreground">{f.q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        New to pseolint? Start with the{" "}
        <Link href="/tools" className="text-foreground underline decoration-dotted underline-offset-2">free web tools</Link>{" "}
        or read the{" "}
        <Link href="/methodology" className="text-foreground underline decoration-dotted underline-offset-2">calibration methodology</Link>.
      </p>

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        The MCP server exposes four tools over the Model Context Protocol: an
        async site audit that returns a per-template risk score and full findings
        JSON, a score-explanation tool that surfaces quick wins ranked by severity,
        a per-page technical check covering canonical tags, Open Graph, and JSON-LD,
        and an AI-orchestrated audit (stdio only) that produces a paste-able fix
        manifest. All tools run the same 44-rule engine as the web UI — no separate
        install or account required for the remote endpoint.
      </p>

      <SourcesSection
        sources={[
          {
            source: "aiFeatures",
            note: "Google's AI Overviews documentation describes the citation and content-quality signals the MCP server's audit tools directly check for answer-engine readiness.",
          },
          {
            source: "llmsTxt",
            note: "The llms.txt convention for machine-readable site summaries is one of the structured-content signals checked by the MCP server's per-page technical tool.",
          },
          {
            source: "helpfulContent",
            note: "Google's helpful-content system guidance informs the content-quality rules — thin content, boilerplate ratio, citable facts — surfaced in every MCP audit response.",
          },
        ]}
      />
    </main>
  );
}
