import { describe, it, expect } from "vitest";
import {
  extractCitableFacts,
  extractMeasurements,
} from "../../src/algorithms/fact-extraction.js";

describe("extractCitableFacts (frozen numeric subset)", () => {
  it("extracts money, percent, timeframe, month-date, isoDate, form; dedupes lowercased", () => {
    const text =
      "It costs $1,200.00, grew 45% in 30 days by March 5, 2024 (2024-03-05). File Form W-9. Again $1,200.00.";
    const facts = extractCitableFacts(text);
    expect(facts).toContain("$1,200.00");
    expect(facts).toContain("45%");
    expect(facts).toContain("30 days");
    expect(facts).toContain("march 5, 2024");
    expect(facts).toContain("2024-03-05");
    expect(facts).toContain("form w-9");
    // dedupe: $1,200.00 appears twice -> one entry
    expect(facts.filter((f) => f === "$1,200.00")).toHaveLength(1);
  });

  it("does NOT count bare word-counts as facts (e.g. '300 words')", () => {
    expect(extractCitableFacts("This page has 300 words of content.")).toEqual([]);
  });
});

describe("extractMeasurements (new, NOT part of citableFacts)", () => {
  it("extracts ratios and unit measurements", () => {
    const m = extractMeasurements("3 out of 4 users; 1 in 5 fail; weighs 12 kg over 250 ms.");
    const values = m.map((x) => x.value);
    expect(values).toContain("3 out of 4");
    expect(values).toContain("1 in 5");
    expect(values).toContain("12 kg");
    expect(values).toContain("250 ms");
  });
});

import { extractNamedEntities } from "../../src/algorithms/fact-extraction.js";

describe("extractNamedEntities", () => {
  it("detects acronyms, cue-word orgs, and JSON-LD entities; dedupes", () => {
    const text = "The GDPR and the Federal Trade Commission reviewed it. The GDPR again.";
    const jsonLd = [{ "@type": "Organization", name: "Acme Corp" }];
    const ents = extractNamedEntities(text, jsonLd).map((e) => e.value);
    expect(ents).toContain("gdpr");
    expect(ents).toContain("federal trade commission");
    expect(ents).toContain("acme corp");
    expect(ents.filter((e) => e === "gdpr")).toHaveLength(1);
  });
});

import {
  classifyCitations,
  hasAuthoritativeCitation,
  registrableDomain,
} from "../../src/algorithms/fact-extraction.js";

describe("registrableDomain", () => {
  it("handles plain and multi-part suffixes", () => {
    expect(registrableDomain("www.example.com")).toBe("example.com");
    expect(registrableDomain("sub.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("nih.gov")).toBe("nih.gov");
  });
});

describe("classifyCitations", () => {
  const pageUrl = "https://mysite.com/post";
  it("classifies external links by TLD and allowlist; drops internal", () => {
    const hrefs = [
      "https://mysite.com/other",          // internal -> dropped
      "https://www.epa.gov/report",        // .gov -> authoritative (tld)
      "https://en.wikipedia.org/wiki/X",   // allowlist -> authoritative
      "https://randomblog.com/x",          // general
    ];
    const cites = classifyCitations(hrefs, pageUrl);
    expect(cites).toHaveLength(3);
    expect(cites.find((c) => c.domain === "epa.gov")?.authority).toBe("authoritative");
    expect(cites.find((c) => c.domain === "epa.gov")?.reason).toBe("tld");
    expect(cites.find((c) => c.domain === "wikipedia.org")?.reason).toBe("allowlist");
    expect(cites.find((c) => c.domain === "randomblog.com")?.authority).toBe("general");
    expect(hasAuthoritativeCitation(hrefs, pageUrl)).toBe(true);
  });
});

import { extractGroundedClaims, extractPageFacts } from "../../src/algorithms/fact-extraction.js";

describe("extractGroundedClaims", () => {
  it("flags a block that has a statistic AND an outbound citation", () => {
    const html =
      '<main><p>Emissions fell 30% last year, per the <a href="https://epa.gov/data">EPA</a>.</p>' +
      "<p>This paragraph has 12% but no link.</p>" +
      '<p>This one links to <a href="https://epa.gov/x">EPA</a> but states no number.</p></main>';
    const claims = extractGroundedClaims(html, "https://mysite.com/p");
    expect(claims).toHaveLength(1);
    expect(claims[0].facts).toContain("30%");
    expect(claims[0].citations[0]).toContain("epa.gov");
  });
});

describe("extractPageFacts", () => {
  it("assembles all five buckets", () => {
    const page = {
      url: "https://mysite.com/p",
      contentText: "Costs $50. 3 out of 4 users. The FDA approved it.",
      html: '<main><p>Costs $50, says the <a href="https://fda.gov/x">FDA</a>.</p></main>',
      resolvedHrefs: ["https://fda.gov/x"],
      jsonLd: [],
    };
    const facts = extractPageFacts(page, []);
    expect(facts.citableFacts).toContain("$50");
    expect(facts.measurements.map((m) => m.value)).toContain("3 out of 4");
    expect(facts.namedEntities.map((e) => e.value)).toContain("fda");
    expect(facts.citations[0].authority).toBe("authoritative");
    expect(facts.groundedClaims).toHaveLength(1);
  });
});
