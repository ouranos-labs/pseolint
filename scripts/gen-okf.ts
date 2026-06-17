#!/usr/bin/env bun
/**
 * Generate an Open Knowledge Format (OKF v0.1) bundle from pseolint's published
 * rule catalog (apps/web `MARKETING_RULES`). OKF is just a directory of markdown
 * files with YAML frontmatter, cross-linked into a graph — portable, git-shippable,
 * agent-consumable. See https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing
 *
 * The source of truth stays `MARKETING_RULES`; this only reformats it. Re-run
 * (`bun run gen:okf`) after editing rules.
 *
 * ponytail: no new catalog, no deps — reads the catalog that already powers the
 * /rules pages and writes markdown. Covers only the 30 published rules; the other
 * ~19 have no authored content (generating them would be hallucination).
 */
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MARKETING_RULES } from "../apps/web/src/lib/marketing-rules.ts";
import { resolveSources } from "../apps/web/src/lib/marketing-sources.ts";

const OUT = join(import.meta.dir, "..", "docs", "okf");
const SITE = "https://pseolint.dev";
const NOW = new Date().toISOString();

const categoryOf = (ruleId: string) => ruleId.split("/")[0];
const catBySlug = new Map(MARKETING_RULES.map((r) => [r.slug, categoryOf(r.ruleId)]));

// YAML double-quoted scalar (these fields are single-line; escape \ and ").
const y = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function frontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

function ruleDoc(rule: (typeof MARKETING_RULES)[number]): string {
  const cat = categoryOf(rule.ruleId);
  const fm = frontmatter({
    type: "pSEO Audit Rule",
    title: y(rule.title),
    description: y(rule.metaDescription),
    resource: `${SITE}/rules/${rule.slug}`,
    ruleId: y(rule.ruleId),
    tags: `[${cat}, ${y(rule.primaryKeyword)}]`,
    timestamp: NOW,
  });

  // Related rules → relative markdown links form the OKF graph.
  const related = rule.relatedRules
    .map((slug) => {
      const rcat = catBySlug.get(slug);
      return rcat ? `- [${slug}](../${rcat}/${slug}.md)` : `- ${slug}`;
    })
    .join("\n");

  const sources = resolveSources(rule.sources)
    .map((s) => `- [${s.title}](${s.url})${s.note ? ` — ${s.note}` : ""}`)
    .join("\n");

  return [
    fm,
    `# ${rule.title}\n`,
    `> ${rule.oneLiner}\n`,
    `_Rule \`${rule.ruleId}\` · [live explainer](${SITE}/rules/${rule.slug})_\n`,
    `# What it detects\n${rule.whatItDetects}\n`,
    `# Why it matters\n${rule.whyItMatters}\n`,
    `# Failing example\n${rule.failingExample}\n`,
    `# Passing example\n${rule.passingExample}\n`,
    `# How to fix\n${rule.howToFix.map((b) => `- ${b}`).join("\n")}\n`,
    related ? `# Related rules\n${related}\n` : "",
    sources ? `# Sources\n${sources}\n` : "",
  ].join("\n");
}

function categoryIndex(cat: string, rules: typeof MARKETING_RULES): string {
  const fm = frontmatter({
    type: "Category",
    title: y(`${cat} rules`),
    description: y(`pseolint ${cat} audit rules for programmatic SEO.`),
    resource: `${SITE}/rules`,
    timestamp: NOW,
  });
  const list = rules
    .map((r) => `- [${r.title}](./${r.slug}.md) — ${r.oneLiner.split(".")[0]}.`)
    .join("\n");
  return `${fm}\n# ${cat} rules\n\n${list}\n`;
}

function rootIndex(byCat: Map<string, typeof MARKETING_RULES>): string {
  const fm = frontmatter({
    type: "Knowledge Base",
    title: y("pseolint pSEO audit rules"),
    description: y("SpamBrain-mapped and AI-Overview rules pseolint checks programmatic-SEO sites against."),
    resource: SITE,
    timestamp: NOW,
  });
  const cats = [...byCat.entries()]
    .map(([cat, rules]) => `- [${cat}](./${cat}/index.md) — ${rules.length} rule${rules.length === 1 ? "" : "s"}`)
    .join("\n");
  return `${fm}
# pseolint pSEO audit rules

An [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)
bundle of pseolint's audit rules — one concept per markdown file, cross-linked into a graph.
Generated from the catalog at [${SITE}/rules](${SITE}/rules); regenerate with \`bun run gen:okf\`.

# Categories
${cats}
`;
}

function main() {
  const byCat = new Map<string, typeof MARKETING_RULES>();
  for (const rule of MARKETING_RULES) {
    const cat = categoryOf(rule.ruleId);
    (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(rule);
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "index.md"), rootIndex(byCat));

  let ruleFiles = 0;
  for (const [cat, rules] of byCat) {
    const dir = join(OUT, cat);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.md"), categoryIndex(cat, rules));
    for (const rule of rules) {
      writeFileSync(join(dir, `${rule.slug}.md`), ruleDoc(rule));
      ruleFiles++;
    }
  }

  // Self-check: every published rule produced exactly one file, all well-formed.
  if (ruleFiles !== MARKETING_RULES.length) {
    throw new Error(`expected ${MARKETING_RULES.length} rule files, wrote ${ruleFiles}`);
  }
  for (const [cat] of byCat) {
    for (const f of readdirSync(join(OUT, cat))) {
      const text = readFileSync(join(OUT, cat, f), "utf8");
      if (!text.startsWith("---\ntype:")) throw new Error(`${cat}/${f} missing OKF frontmatter`);
    }
  }
  console.log(`OKF bundle: ${ruleFiles} rules in ${byCat.size} categories → ${OUT}`);
}

main();
