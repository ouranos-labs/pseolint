"use client";

import { useState } from "react";

const LANGUAGES = ["Next.js (App Router)", "React (SPA)", "HTML Templates"];

const NEXTJS_BAD = `// apps/web/app/listing/[city]/page.tsx
// ❌ BAD: No canonical tag, generic descriptions, missing schema.org entities.
export default function CityPage({ params }: { params: { city: string } }) {
  return (
    <main>
      <h1>Services in {params.city}</h1>
      <p>Looking for services in {params.city}? We offer the best solutions...</p>
      {/* 80% boilerplate page layout follows */}
    </main>
  );
}`;

const NEXTJS_GOOD = `// apps/web/app/listing/[city]/page.tsx
// ✅ GOOD: Dynamic metadata, unique descriptions, self-referencing canonicals, nested JSON-LD schema.
import { Metadata } from "next";

export async function generateMetadata({ params }): Promise<Metadata> {
  const canonical = \`https://pseolint.dev/listing/\${params.city}\`;
  return {
    title: \`Local Services in \${params.city} | Certified Providers\`,
    description: \`Find top-rated local services in \${params.city}. Verified local provider listings, pricing estimates, and real user reviews.\`,
    alternates: { canonical }
  };
}

export default function CityPage({ params }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": \`Certified Service Providers in \${params.city}\`,
    "description": \`Top-rated verified provider listings in \${params.city}.\`,
    "address": { "@type": "PostalAddress", "addressLocality": params.city }
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <h1>Services in {params.city}</h1>
      {/* Dynamic, dense, localized data tables and reviews */}
    </main>
  );
}`;

const REACT_BAD = `// components/listing.jsx
// ❌ BAD: Standard client-side routing swaps state with no meta tags, no SSR indexing support.
export function Listing({ city }) {
  return (
    <div>
      <h2>Directory: {city}</h2>
      <p>List of all companies in {city}...</p>
    </div>
  );
}`;

const REACT_GOOD = `// components/listing.jsx
// ✅ GOOD: SSR / Next.js wrapper with React Helmet or dynamic document metadata.
import { Helmet } from "react-helmet";

export function Listing({ city, data }) {
  return (
    <div>
      <Helmet>
        <title>Top Companies in {city} - 2026 Directory</title>
        <meta name="description" content={\`Browse \${data.count} verified companies in \${city}.\`} />
        <link rel="canonical" href={\`https://domain.com/directory/\${city}\`} />
      </Helmet>
      
      <h2>Directory: {city}</h2>
      {/* Unique table content and interactive charts */}
    </div>
  );
}`;

const HTML_BAD = `<!-- listing-template.html -->
<!-- ❌ BAD: Identical meta headers, high boilerplate ratio, no entity schema. -->
<head>
  <title>SEO Directory Page</title>
  <meta name="description" content="Local listing template page.">
</head>
<body>
  <div class="header">Global Header (200 links)</div>
  <h1>Results for Boston</h1>
  <div class="footer">Global Footer (100 links)</div>
</body>`;

const HTML_GOOD = `<!-- listing-template.html -->
<!-- ✅ GOOD: Contextual titles, self canonical, boilerplate under 50%, structured data. -->
<head>
  <title>Best local providers in Boston - 2026 Ratings</title>
  <meta name="description" content="Find the top 5 verified Boston providers. Read community reviews and compare estimates.">
  <link rel="canonical" href="https://site.com/boston">
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": "Boston Service Co.",
      "address": { "@type": "PostalAddress", "addressLocality": "Boston", "addressRegion": "MA" },
      "areaServed": "Boston, MA"
    }
  </script>
</head>
<body>
  <h1>Boston's Verified Providers</h1>
  <!-- Q&A lives in the visible page, not in retired FAQPage markup -->
  <h2>Who is the top-rated provider in Boston?</h2>
  <p>Boston Service Co. is currently rated #1, with 412 verified reviews and a 4.8 average.</p>
  <!-- Boilerplate deferred / slimmed; rich entity content > 60% of DOM -->
</body>`;

export function CodeComparison() {
  const [activeTab, setActiveTab] = useState(0);

  const getCode = () => {
    switch (activeTab) {
      case 0:
        return { bad: NEXTJS_BAD, good: NEXTJS_GOOD, lang: "typescript" };
      case 1:
        return { bad: REACT_BAD, good: REACT_GOOD, lang: "javascript" };
      case 2:
        return { bad: HTML_BAD, good: HTML_GOOD, lang: "html" };
      default:
        return { bad: "", good: "", lang: "text" };
    }
  };

  const { bad, good } = getCode();

  return (
    <div className="rounded-[22px] border border-border/70 bg-card/60 p-6 backdrop-blur-sm shadow-xl">
      {/* Tabs list */ }
      <div className="flex border-b border-border/60 pb-3 mb-6 gap-2">
        { LANGUAGES.map((lang, idx) => (
          <button
            key={ lang }
            onClick={ () => setActiveTab(idx) }
            className={ `px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${activeTab === idx
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }` }
          >
            { lang }
          </button>
        )) }
      </div>

      {/* Diffs grid */ }
      <div className="grid gap-6 md:grid-cols-2">
        {/* Bad Code */ }
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-destructive/20 pb-2 mb-3">
              <span className="text-xs font-bold text-destructive">❌ Bad (SpamBrain Trigger)</span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase">Before</span>
            </div>
            <pre className="font-mono text-[10px] leading-relaxed overflow-x-auto text-destructive-foreground/90 whitespace-pre">
              <code>{ bad }</code>
            </pre>
          </div>
        </div>

        {/* Good Code */ }
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-primary/20 pb-2 mb-3">
              <span className="text-xs font-bold text-primary">✅ Good (Compliant & Dynamic)</span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase">After</span>
            </div>
            <pre className="font-mono text-[10px] leading-relaxed overflow-x-auto text-primary/90 whitespace-pre">
              <code>{ good }</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
