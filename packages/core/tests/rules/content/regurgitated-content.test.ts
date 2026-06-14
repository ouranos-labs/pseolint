import { describe, expect, test } from "vitest";
import { regurgitatedContentRule } from "../../../src/rules/content/regurgitated-content.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, html: string, extra: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [],
    structureSignature: "",
    contentText: "",
    html,
    ...extra,
  };
}

// Helper to build multiple googleusercontent img tags
function googleImgs(n: number): string {
  return Array.from({ length: n }, (_, i) =>
    `<img src="https://lh3.googleusercontent.com/photo${i}.jpg" alt="photo${i}">`
  ).join("\n");
}

describe("regurgitatedContentRule", () => {
  test("bestfirenze-style: Powered by Google + 6 googleusercontent images fires warning", () => {
    const html = `
      <div>Powered by Google</div>
      ${googleImgs(6)}
      <img src="https://example.com/own-photo.jpg" alt="local">
    `;
    const findings = regurgitatedContentRule([page("https://bestfirenze.com/uffizi", html)]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].ruleId).toBe("content/regurgitated-content");
    expect(findings[0].message).toContain("Google Places attribution");
    expect(findings[0].message).toContain("Google-hosted images dominate");
    expect(findings[0].pageUrl).toBe("https://bestfirenze.com/uffizi");
  });

  test("single signal (only googleusercontent images, no attribution) does not fire", () => {
    // 6 googleusercontent images but NO attribution text -- only 1 signal
    const html = `
      ${googleImgs(6)}
      <p>Visit Florence today.</p>
    `;
    const findings = regurgitatedContentRule([page("https://bestfirenze.com/ponte-vecchio", html)]);
    expect(findings).toHaveLength(0);
  });

  test("legit travel blog: original photos + one Maps embed fires nothing (1 signal only)", () => {
    const html = `
      <img src="https://cdn.travelblog.com/img1.jpg" alt="Florence">
      <img src="https://cdn.travelblog.com/img2.jpg" alt="Arno">
      <iframe src="https://www.google.com/maps/embed?pb=123" title="map"></iframe>
      <p>My personal favourite spots in Florence after 3 visits.</p>
    `;
    const findings = regurgitatedContentRule([page("https://travelblog.com/florence", html)]);
    expect(findings).toHaveLength(0);
  });

  test("Places API JS marker + Static Maps embed fires finding with both signals", () => {
    const html = `
      <script>
        const service = new google.maps.places.PlacesService(map);
        service.nearbySearch(request, callback);
      </script>
      <img src="https://maps.googleapis.com/maps/api/staticmap?center=Florence&zoom=13" alt="map">
    `;
    const findings = regurgitatedContentRule([page("https://example.com/places-page", html)]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("Places API JS markers");
    expect(findings[0].message).toContain("Google Static Maps or Maps embed");
  });

  test("empty page (no html) fires nothing", () => {
    const findings = regurgitatedContentRule([page("https://example.com/empty", "")]);
    expect(findings).toHaveLength(0);
  });

  test("page with 5+ review-style blocks (X/5 + paragraphs) without author signal + Google attribution fires", () => {
    const reviews = Array.from({ length: 5 }, (_, i) =>
      `<div class="review"><p>Great restaurant #${i + 1}!</p><span>4.${i}/5</span></div>`
    ).join("\n");
    const html = `
      <div>Powered by Google</div>
      ${reviews}
    `;
    const findings = regurgitatedContentRule([page("https://directory.com/restaurants/florence", html)]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("Google Places attribution");
    expect(findings[0].message).toContain("Aggregator footprint");
  });

  test("page with review blocks but has author signal (eeat>=2) suppresses aggregator signal", () => {
    // Author signal + published date = eeat >= 2, so aggregator check returns false
    const reviews = Array.from({ length: 5 }, (_, i) =>
      `<div class="review"><p>Review #${i + 1}</p><span>4.${i}/5</span></div>`
    ).join("\n");
    const html = `<div>Powered by Google</div>${reviews}`;
    const p = page("https://directory.com/page", html, {
      authorSignals: { metaAuthor: "John Doe", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
      publishedDate: "2024-01-01",
    });
    // Only 1 signal (Google attribution), aggregator suppressed by eeat
    const findings = regurgitatedContentRule([p]);
    expect(findings).toHaveLength(0);
  });

  test("places API AutocompleteService variant is detected", () => {
    const html = `
      <script>const ac = new google.maps.places.AutocompleteService();</script>
      <img src="https://maps.googleapis.com/maps/api/staticmap?center=Rome" alt="map">
    `;
    const findings = regurgitatedContentRule([page("https://example.com/ac-page", html)]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("Places API JS markers");
  });

  test("explainer page: patterns quoted inside code/[data-example] don't fire", () => {
    // /rules/regurgitated-content documents the exact strings the rule scans for.
    // Quoted as <code>/example markup, they must NOT count as the page's own use.
    const html = `
      <main>
        <h1>Regurgitated content</h1>
        <p>This rule looks for sites that lift Google Places data.</p>
        <ul data-example>
          <li><code>powered by Google</code> attribution text</li>
          <li><code>maps.googleapis.com/maps/api/staticmap</code> image source</li>
          <li><code>google.maps.places.PlacesService</code> JS marker</li>
        </ul>
      </main>
    `;
    const findings = regurgitatedContentRule([page("https://pseolint.dev/rules/regurgitated-content", html)]);
    expect(findings).toHaveLength(0);
  });

  test("real site: live <script> Places JS still trips (script is not example markup)", () => {
    // The exclusion removes example/code regions but NOT <script> — a genuine
    // scraper carries the marker in a live script, which must still be detected.
    const html = `
      <script>const s = new google.maps.places.PlacesService(map);</script>
      <img src="https://maps.googleapis.com/maps/api/staticmap?center=Florence" alt="map">
    `;
    const findings = regurgitatedContentRule([page("https://scraper.example/places", html)]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("Places API JS markers");
  });

  test("fewer than 3 images skips the image-ratio check entirely", () => {
    // 2 googleusercontent images + Powered by Google = 1 signal (ratio check skipped)
    const html = `
      <div>Powered by Google</div>
      <img src="https://lh3.googleusercontent.com/a.jpg" alt="a">
      <img src="https://lh3.googleusercontent.com/b.jpg" alt="b">
    `;
    const findings = regurgitatedContentRule([page("https://example.com/few-imgs", html)]);
    expect(findings).toHaveLength(0);
  });
});