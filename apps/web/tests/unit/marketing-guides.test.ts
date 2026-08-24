/**
 * Orphan guard for hand-written editorial pages.
 *
 * `links/orphan-pages` was the single blocker in pseolint.dev's own audit: 7 of the
 * 8 editorial route files under /rules and /tools shipped with no inbound internal
 * links, because the hubs only iterate MARKETING_RULES / MARKETING_TOOLS and these
 * pages live in neither array.
 *
 * Fixing the 7 is not enough: the next hand-written page would silently repeat it.
 * So this test asserts the invariant instead of the instance: every non-dynamic page
 * route in those sections is either a data-driven entry or a registered guide, and
 * every registered guide actually resolves to a route file and is rendered by its hub.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MARKETING_GUIDES, guidesForSection } from "@/lib/marketing-guides";
import { MARKETING_RULES } from "@/lib/marketing-rules";
import { MARKETING_TOOLS } from "@/lib/marketing-tools";

const APP = join(process.cwd(), "src", "app");

/** Route slugs that own a page.tsx directly under `src/app/<section>/`. */
function routeSlugs(section: string): string[] {
  const dir = join(APP, section);
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    // Dynamic segments render the data-driven entries, not standalone pages.
    .filter((e) => !e.name.startsWith("[") && !e.name.startsWith("("))
    .filter((e) => existsSync(join(dir, e.name, "page.tsx")))
    .map((e) => e.name);
}

const SECTIONS = [
  { section: "rules" as const, dataSlugs: MARKETING_RULES.map((r) => r.slug) },
  { section: "tools" as const, dataSlugs: MARKETING_TOOLS.map((t) => t.slug) },
];

describe("editorial guide registry", () => {
  it("registers every slug in the registry exactly once", () => {
    const slugs = MARKETING_GUIDES.map((g) => `${g.section}/${g.slug}`);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses kebab-case slugs", () => {
    for (const g of MARKETING_GUIDES) {
      expect(g.slug, g.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("carries a non-empty title and blurb for each guide", () => {
    for (const g of MARKETING_GUIDES) {
      expect(g.title.trim().length, g.slug).toBeGreaterThan(0);
      expect(g.blurb.trim().length, g.slug).toBeGreaterThan(20);
    }
  });

  for (const { section, dataSlugs } of SECTIONS) {
    it(`leaves no /${section} page orphaned`, () => {
      const registered = new Set(guidesForSection(section).map((g) => g.slug));
      const known = new Set([...dataSlugs, ...registered]);
      // A standalone page.tsx that is neither a data entry nor a registered guide
      // has nothing linking to it; that is precisely an orphan.
      const orphans = routeSlugs(section).filter((s) => !known.has(s));
      expect(orphans, `unlinked /${section} pages: add them to MARKETING_GUIDES`).toEqual([]);
    });

    it(`resolves every registered /${section} guide to a real route`, () => {
      for (const g of guidesForSection(section)) {
        const page = join(APP, section, g.slug, "page.tsx");
        expect(existsSync(page), `${section}/${g.slug} has no page.tsx`).toBe(true);
      }
    });

    it(`renders the /${section} guides from the section hub`, () => {
      // Guards against the registry existing but the hub forgetting to map it:
      // which would leave the pages orphaned exactly as before.
      const hub = readFileSync(join(APP, section, "page.tsx"), "utf8");
      expect(hub).toContain("guidesForSection");
      expect(hub).toContain(`guidesForSection("${section}")`);
    });
  }
});
