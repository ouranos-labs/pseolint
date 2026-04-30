import { describe, expect, test } from "vitest";
import {
  classifySite,
  clusterUrlTemplates,
  normalizePathToTemplate,
  PSEO_ONLY_RULE_IDS,
} from "../src/site-classifier.js";

describe("normalizePathToTemplate", () => {
  test("normalizes hyphenated multi-word segments to :slug", () => {
    // Single-word segments stay literal so collection roots (/blog) don't
    // collide with their detail-page templates (/blog/:slug). Hyphenated
    // multi-word segments are slugs.
    expect(normalizePathToTemplate("/california/los-angeles/plumbers")).toBe(
      "/california/:slug/plumbers",
    );
  });

  test("clusters multi-city pages under a shared template", () => {
    // High-cardinality pages with hyphenated city slugs collapse together.
    const t1 = normalizePathToTemplate("/california/los-angeles/plumbers");
    const t2 = normalizePathToTemplate("/california/san-diego/plumbers");
    const t3 = normalizePathToTemplate("/california/santa-clara/plumbers");
    expect(t1).toBe(t2);
    expect(t2).toBe(t3);
  });

  test("normalizes numeric segments to :n", () => {
    expect(normalizePathToTemplate("/post/12345")).toBe("/post/:n");
  });

  test("treats short literal segments as fixed tokens", () => {
    expect(normalizePathToTemplate("/us/api/v2")).toBe("/us/api/v2");
  });

  test("treats single-word literal segments as fixed tokens", () => {
    // about/blog/contact stay literal so they cluster into their own buckets.
    expect(normalizePathToTemplate("/about")).toBe("/about");
    expect(normalizePathToTemplate("/blog")).toBe("/blog");
    expect(normalizePathToTemplate("/contact")).toBe("/contact");
  });

  test("very long single-word segment treated as :slug", () => {
    // No-hyphen URL slugs (concatenated) past 12 chars get :slug.
    expect(normalizePathToTemplate("/chicagoplumbers")).toBe("/:slug");
  });

  test("blog/:slug retains the literal /blog prefix", () => {
    expect(normalizePathToTemplate("/blog/hello-world")).toBe("/blog/:slug");
  });

  test("root path returns /", () => {
    expect(normalizePathToTemplate("/")).toBe("/");
    expect(normalizePathToTemplate("")).toBe("/");
  });

  test("strips trailing slash for consistency", () => {
    expect(normalizePathToTemplate("/blog/hello-world/")).toBe("/blog/:slug");
  });
});

describe("clusterUrlTemplates", () => {
  test("ranks templates by frequency", () => {
    const urls = [
      "https://example.com/blog/post-one",
      "https://example.com/blog/post-two",
      "https://example.com/blog/post-three",
      "https://example.com/about",
    ];
    const clusters = clusterUrlTemplates(urls);
    expect(clusters[0].template).toBe("/blog/:slug");
    expect(clusters[0].count).toBe(3);
    expect(clusters[0].ratio).toBeCloseTo(0.75);
    expect(clusters[1].template).toBe("/about");
    expect(clusters[1].count).toBe(1);
  });

  test("returns empty array on empty input", () => {
    expect(clusterUrlTemplates([])).toEqual([]);
  });

  test("ignores malformed URLs gracefully", () => {
    const clusters = clusterUrlTemplates(["not a url", "https://example.com/x"]);
    // "not a url" is treated as a path → /not a url
    expect(clusters.length).toBeGreaterThan(0);
  });
});

describe("classifySite", () => {
  test("empty URL list → unclear with confidence 0", () => {
    const c = classifySite({ urls: [] });
    expect(c.type).toBe("unclear");
    expect(c.confidence).toBe(0);
    expect(c.suppressedRules).toEqual([]);
  });

  test("tiny URL list (5 URLs, varied templates) → small-marketing", () => {
    const urls = [
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/pricing",
      "https://example.com/contact",
      "https://example.com/features",
    ];
    const c = classifySite({ urls });
    expect(c.type).toBe("small-marketing");
    expect(c.confidence).toBeGreaterThanOrEqual(0.85);
    expect(c.suppressedRules).toEqual([...PSEO_ONLY_RULE_IDS]);
  });

  test("large URL list (5000 URLs) with one dominant template → programmatic-directory", () => {
    const urls: string[] = [];
    const states = ["california", "texas", "florida", "newyork", "illinois"];
    const cities = Array.from({ length: 1000 }, (_, i) => `city-number-${i}`);
    for (const state of states) {
      for (const city of cities) {
        urls.push(`https://example.com/${state}/${city}/plumbers`);
      }
    }
    const c = classifySite({ urls });
    expect(c.type).toBe("programmatic-directory");
    expect(c.confidence).toBeGreaterThanOrEqual(0.9);
    expect(c.suppressedRules).toEqual([]);
    const cluster = c.signals.find((s) => s.kind === "url-pattern-cluster-coverage");
    expect(cluster).toBeDefined();
  });

  test("large URL list with no dominant template → ecommerce", () => {
    // 1500 unique product slugs at 1-deep paths; each cluster is unique because slugs differ
    // but template normalization will collapse them into /:slug. So we need varied DEPTHS
    // to avoid clustering.
    const urls: string[] = [];
    for (let i = 0; i < 500; i++) {
      urls.push(`https://example.com/products/widget-${i}`);
    }
    for (let i = 0; i < 500; i++) {
      urls.push(`https://example.com/category-${i}/sub`);
    }
    for (let i = 0; i < 500; i++) {
      urls.push(`https://example.com/brand-${i}/group/item`);
    }
    const c = classifySite({ urls });
    // Top 3 templates here = /products/:slug, /:slug/sub, /:slug/group/item — covers 100%.
    // The clustering CAN succeed here, leading to programmatic-directory.
    // To force ecommerce we need many distinct templates; mix 7 different shapes:
    const ecommerceUrls: string[] = [];
    for (let i = 0; i < 700; i++) {
      ecommerceUrls.push(`https://example.com/products/widget-${i}`); // /products/:slug
    }
    for (let i = 0; i < 200; i++) {
      ecommerceUrls.push(`https://example.com/cart/${i}/checkout`); // /cart/:n/checkout
    }
    for (let i = 0; i < 200; i++) {
      ecommerceUrls.push(`https://example.com/u/${i}`); // /u/:n
    }
    for (let i = 0; i < 200; i++) {
      ecommerceUrls.push(`https://example.com/order/${i}/track/${i}`); // /order/:n/track/:n
    }
    for (let i = 0; i < 200; i++) {
      ecommerceUrls.push(`https://example.com/seller/${i}/page/${i}/x`); // /seller/:n/page/:n/x
    }
    for (let i = 0; i < 200; i++) {
      ecommerceUrls.push(`https://example.com/x/${i}/y/${i}/z/${i}`); // 5-level
    }
    for (let i = 0; i < 200; i++) {
      ecommerceUrls.push(`https://example.com/q/${i}/r/${i}/s/${i}/t`); // 6-level
    }
    expect(ecommerceUrls.length).toBeGreaterThan(1000);
    const c2 = classifySite({ urls: ecommerceUrls });
    // Top 3 = /products/:slug (700/1900 = 36%), /cart/:n/checkout (10%), /u/:n (10%) = 56%, < 60%
    expect(c2.type).toBe("ecommerce");
    expect(c2.suppressedRules).toEqual([]);
  });

  test("medium URL list (200 URLs) with no clear pattern → unclear", () => {
    const urls: string[] = [];
    for (let i = 0; i < 50; i++) urls.push(`https://example.com/section-a/${i}/x`);
    for (let i = 0; i < 50; i++) urls.push(`https://example.com/section-b/${i}/y/z`);
    for (let i = 0; i < 50; i++) urls.push(`https://example.com/section-c/${i}/m/n/o`);
    for (let i = 0; i < 50; i++) urls.push(`https://example.com/section-d/${i}/a/b/c/d`);
    const c = classifySite({ urls });
    // Each is a distinct template; top-3 covers 75% so this actually DOES cluster.
    // For a true "no pattern" medium site, use many varied depths:
    const variedUrls: string[] = [];
    for (let i = 0; i < 200; i++) {
      const depth = (i % 6) + 1;
      const segs = Array.from({ length: depth }, (_, k) => `level${i}-${k}`);
      variedUrls.push(`https://example.com/${segs.join("/")}`);
    }
    const c2 = classifySite({ urls: variedUrls });
    expect(c2.type).toBe("unclear");
    expect(c2.suppressedRules).toEqual([]);
  });

  test("medium URL list (200 URLs) with dominant template → programmatic-directory", () => {
    const urls: string[] = [];
    for (let i = 0; i < 200; i++) {
      urls.push(`https://example.com/services/${i % 50}/austin-texas`);
    }
    const c = classifySite({ urls });
    expect(c.type).toBe("programmatic-directory");
    expect(c.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test("blog pattern detection (/blog/:slug covering 50% of < 50 URLs) → blog", () => {
    const urls = [
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/contact",
      "https://example.com/blog",
      "https://example.com/blog/post-one",
      "https://example.com/blog/post-two",
      "https://example.com/blog/post-three",
      "https://example.com/blog/post-four",
      "https://example.com/blog/post-five",
      "https://example.com/blog/post-six",
    ];
    const c = classifySite({ urls });
    expect(c.type).toBe("blog");
    expect(c.confidence).toBeGreaterThanOrEqual(0.85);
    expect(c.suppressedRules).toEqual([...PSEO_ONLY_RULE_IDS]);
  });

  test("framework signal is recorded in signals array", () => {
    const c = classifySite({
      urls: ["https://example.com/", "https://example.com/about"],
      framework: "nextjs",
    });
    const fw = c.signals.find((s) => s.kind === "framework-detected");
    expect(fw).toEqual({ kind: "framework-detected", value: "nextjs" });
  });

  test("framework defaults to 'unknown' when not provided", () => {
    const c = classifySite({ urls: ["https://example.com/"] });
    const fw = c.signals.find((s) => s.kind === "framework-detected");
    expect(fw).toEqual({ kind: "framework-detected", value: "unknown" });
  });

  test("Next.js + small URL count nudges confidence upward", () => {
    const baseUrls = [
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/pricing",
    ];
    const cNoFw = classifySite({ urls: baseUrls });
    const cNext = classifySite({ urls: baseUrls, framework: "nextjs" });
    expect(cNext.confidence).toBeGreaterThan(cNoFw.confidence);
  });

  test("signals array always carries sitemap-url-count first", () => {
    const c = classifySite({ urls: ["https://example.com/x"] });
    expect(c.signals[0]).toEqual({ kind: "sitemap-url-count", value: 1 });
  });

  test("v0.4.3 — docs site detected when /docs/* dominates URL set", () => {
    const urls: string[] = [
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/pricing",
    ];
    for (let i = 0; i < 80; i += 1) {
      urls.push(`https://example.com/docs/page-${i}`);
    }
    const c = classifySite({ urls });
    expect(c.type).toBe("docs");
    expect(c.confidence).toBeGreaterThanOrEqual(0.7);
    expect(c.suppressedRules).toEqual([]);
  });

  test("v0.4.3 — docs site detected with mixed /docs + /api + /reference paths", () => {
    const urls: string[] = [];
    for (let i = 0; i < 40; i += 1) urls.push(`https://example.com/docs/section-${i}`);
    for (let i = 0; i < 30; i += 1) urls.push(`https://example.com/api/endpoint-${i}`);
    for (let i = 0; i < 20; i += 1) urls.push(`https://example.com/reference/symbol-${i}`);
    // 90 of 100 URLs match docs prefixes — high confidence.
    for (let i = 0; i < 10; i += 1) urls.push(`https://example.com/blog/post-${i}`);
    const c = classifySite({ urls });
    expect(c.type).toBe("docs");
    expect(c.confidence).toBeGreaterThanOrEqual(0.85);
  });

  test("v0.4.3 — docs detector does NOT fire on tiny site with one /docs link", () => {
    // Only 5 URLs total — below the 50-URL guard. Falls through to small-marketing.
    const urls = [
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/pricing",
      "https://example.com/contact",
      "https://example.com/docs/intro",
    ];
    const c = classifySite({ urls });
    expect(c.type).not.toBe("docs");
  });

  test("v0.4.3 — ecommerce detected when /products/* dominates", () => {
    const urls: string[] = [];
    for (let i = 0; i < 80; i += 1) urls.push(`https://example.com/products/widget-${i}`);
    for (let i = 0; i < 10; i += 1) urls.push(`https://example.com/collections/spring-${i}`);
    for (let i = 0; i < 5; i += 1) urls.push(`https://example.com/about-${i}`);
    const c = classifySite({ urls });
    expect(c.type).toBe("ecommerce");
    expect(c.confidence).toBeGreaterThanOrEqual(0.85);
    expect(c.suppressedRules).toEqual([]);
  });

  test("v0.4.3 — ecommerce detected via broader prefix mix at 100+ URLs", () => {
    const urls: string[] = [];
    for (let i = 0; i < 30; i += 1) urls.push(`https://example.com/shop/item-${i}`);
    for (let i = 0; i < 30; i += 1) urls.push(`https://example.com/store/sku-${i}`);
    for (let i = 0; i < 30; i += 1) urls.push(`https://example.com/category/cat-${i}`);
    for (let i = 0; i < 20; i += 1) urls.push(`https://example.com/blog/post-${i}`);
    // 90 of 110 URLs match ecommerce prefixes (~82%).
    const c = classifySite({ urls });
    expect(c.type).toBe("ecommerce");
    expect(c.confidence).toBeGreaterThanOrEqual(0.75);
  });

  test("v0.4.3 — ecommerce takes precedence over docs when both prefixes present", () => {
    const urls: string[] = [];
    // 80% products vs 20% docs — ecommerce should win.
    for (let i = 0; i < 80; i += 1) urls.push(`https://example.com/products/p-${i}`);
    for (let i = 0; i < 20; i += 1) urls.push(`https://example.com/docs/page-${i}`);
    const c = classifySite({ urls });
    expect(c.type).toBe("ecommerce");
  });
});
