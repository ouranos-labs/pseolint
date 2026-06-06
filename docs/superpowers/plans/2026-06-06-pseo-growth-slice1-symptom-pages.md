# pSEO Growth Slice 1 — Symptom/Outcome Pages + Content-Quality Guardrail

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the symptom/outcome page centerpiece with three new high-intent diagnostic pages aligned to the locked positioning ("penalty-risk audit for sites that publish at scale"), protected by a content-quality guardrail test that encodes "every indexable page passes pseolint's own bar by design."

**Architecture:** The `/symptoms/[symptom]` route, its index, and the sitemap are already fully data-driven off `MARKETING_SYMPTOMS` in `apps/web/src/lib/marketing-symptoms.ts`. Adding a page = adding a typed entry to that array; the route, `generateStaticParams`, schema (Article/FAQ/HowTo JSON-LD), and sitemap pick it up automatically. We first add a deterministic **guardrail test** (the dogfood contract) so content quality can't silently regress, then add three new entries that satisfy it.

**Tech Stack:** Next.js App Router, TypeScript, Vitest (`bun run test` → `vitest run`), `@/` path alias → `apps/web/src`.

**Reference spec:** `docs/superpowers/specs/2026-06-06-pseolint-pseo-positioning-growth-design.md`

**Pre-requisite (manual, not a code task):** Demand-validate the three target queries before authoring (spec §"Validation before scaling"). The three chosen below are well-known high-intent panic queries; if a keyword check kills one, swap the slug/keyword and keep the same task structure.

---

## File Structure

- `apps/web/src/lib/marketing-symptoms.ts` — **Modify.** Add one exported helper (`symptomBodyWordCount`) and three new entries to `MARKETING_SYMPTOMS`. Single source of truth for symptom content.
- `apps/web/src/lib/marketing-symptoms.test.ts` — **Create.** The content-quality guardrail (depth + integrity contract). Colocated with the lib it guards (matches `src/lib/leaderboard.test.ts` precedent).
- `apps/web/tests/unit/sitemap-symptoms.test.ts` — **Create.** Regression test that every symptom slug is emitted in the sitemap.

No route, component, or sitemap source changes are required — they are already generic over `MARKETING_SYMPTOMS`.

---

## Task 1: Add `symptomBodyWordCount` helper + depth guardrail

**Files:**
- Modify: `apps/web/src/lib/marketing-symptoms.ts` (append helper after `allSymptomSlugs`)
- Test: `apps/web/src/lib/marketing-symptoms.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/marketing-symptoms.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MARKETING_SYMPTOMS,
  symptomBodyWordCount,
  type MarketingSymptom,
} from "@/lib/marketing-symptoms";

/**
 * The dogfood contract: every indexable /symptoms page must clear a minimum
 * depth so pseolint's own site passes pseolint's own thin-content bar. These
 * minimums are deliberately below the current hand-authored entries — they are
 * a floor that prevents regressions and forces new entries to real depth, not
 * a target.
 */
describe("MARKETING_SYMPTOMS depth contract", () => {
  it("has at least the 5 launch entries", () => {
    expect(MARKETING_SYMPTOMS.length).toBeGreaterThanOrEqual(5);
  });

  it.each(MARKETING_SYMPTOMS.map((s) => [s.slug, s] as const))(
    "%s meets the per-entry depth floor",
    (_slug, entry: MarketingSymptom) => {
      expect(entry.oneLiner.length).toBeGreaterThanOrEqual(80);
      expect(entry.metaDescription.length).toBeGreaterThanOrEqual(50);
      // 160 is the SEO ideal; 180 is the hard regression ceiling. One launch
      // entry already ships at 177 chars, so the floor-test tolerates up to 180.
      // New entries (Tasks 3-5) are authored at <=160.
      expect(entry.metaDescription.length).toBeLessThanOrEqual(180);
      expect(entry.whatYouSee.length).toBeGreaterThanOrEqual(150);
      expect(entry.likelyCauses.length).toBeGreaterThanOrEqual(3);
      for (const c of entry.likelyCauses) {
        expect(c.cause.length).toBeGreaterThanOrEqual(10);
        expect(c.explanation.length).toBeGreaterThanOrEqual(120);
      }
      expect(entry.diagnosticSteps.length).toBeGreaterThanOrEqual(5);
      for (const step of entry.diagnosticSteps) {
        expect(step.length).toBeGreaterThanOrEqual(40);
      }
      expect(entry.faqs.length).toBeGreaterThanOrEqual(4);
      for (const f of entry.faqs) {
        expect(f.q.length).toBeGreaterThanOrEqual(10);
        expect(f.a.length).toBeGreaterThanOrEqual(120);
      }
      expect(entry.caseStudy.length).toBeGreaterThanOrEqual(200);
      expect(entry.recoveryTimeline.length).toBeGreaterThanOrEqual(200);
      expect(symptomBodyWordCount(entry)).toBeGreaterThanOrEqual(500);
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test -- marketing-symptoms`
Expected: FAIL — `symptomBodyWordCount` is not exported (`SyntaxError`/import error).

- [ ] **Step 3: Implement the helper**

In `apps/web/src/lib/marketing-symptoms.ts`, append after `allSymptomSlugs`:

```ts
/**
 * Approximate prose word count for a symptom entry — the body fields a reader
 * actually consumes (nav chrome and slugs excluded). Used by the content-quality
 * guardrail to keep every /symptoms page above pseolint's own thin-content bar.
 */
export function symptomBodyWordCount(entry: MarketingSymptom): number {
  const parts: string[] = [
    entry.oneLiner,
    entry.whatYouSee,
    ...entry.likelyCauses.map((c) => `${c.cause} ${c.explanation}`),
    ...entry.diagnosticSteps,
    entry.caseStudy,
    ...entry.faqs.map((f) => `${f.q} ${f.a}`),
    entry.recoveryTimeline,
  ];
  return parts
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test -- marketing-symptoms`
Expected: PASS — all 5 existing entries clear the floor.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/marketing-symptoms.ts apps/web/src/lib/marketing-symptoms.test.ts
git commit -m "test(web): add symptom content-quality depth guardrail + word-count helper"
```

---

## Task 2: Add integrity guardrail (unique slugs, resolvable rules, kebab-case)

**Files:**
- Modify: `apps/web/src/lib/marketing-symptoms.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/lib/marketing-symptoms.test.ts`:

```ts
import { MARKETING_RULES } from "@/lib/marketing-rules";

describe("MARKETING_SYMPTOMS integrity contract", () => {
  const ruleSlugs = new Set(MARKETING_RULES.map((r) => r.slug));

  it("has unique slugs", () => {
    const slugs = MARKETING_SYMPTOMS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(MARKETING_SYMPTOMS.map((s) => [s.slug] as const))(
    "%s is kebab-case",
    (slug) => {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    },
  );

  it("every relatedRules entry resolves to a real marketing rule", () => {
    for (const s of MARKETING_SYMPTOMS) {
      for (const r of s.relatedRules) {
        expect(ruleSlugs, `symptom ${s.slug} → rule ${r}`).toContain(r);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes (existing data is already valid)**

Run: `cd apps/web && bun run test -- marketing-symptoms`
Expected: PASS. (This contract documents invariants the launch data already meets; it exists to fail loudly when a new entry in Tasks 3–5 references a nonexistent rule or duplicates a slug. The valid rule slugs are: `thin-content`, `doorway-pattern`, `near-duplicate`, `boilerplate-ratio`, `template-diversity`, `host-section-divergence`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/marketing-symptoms.test.ts
git commit -m "test(web): add symptom integrity guardrail (unique slugs, resolvable rules)"
```

---

## Task 3: New symptom — "received a manual action for pure spam"

High-panic, high-intent query; not covered by the existing 5 (which are algorithmic). Full entry below.

**Files:**
- Modify: `apps/web/src/lib/marketing-symptoms.ts` (insert into `MARKETING_SYMPTOMS` array, before the closing `] as const;`)

- [ ] **Step 1: Add the entry**

Insert this object as a new element of `MARKETING_SYMPTOMS`:

```ts
  {
    slug: "manual-action-pure-spam",
    title: "Manual action for pure spam — diagnose and recover",
    metaDescription:
      "Got a 'Pure Spam' manual action in Search Console? Diagnose which programmatic templates triggered it and file a reconsideration that gets approved.",
    primaryKeyword: "pure spam manual action",
    oneLiner:
      "A 'Pure Spam' or 'Thin content with little or no added value' manual action appears in Search Console's Manual Actions report, suppressing some or all of your programmatic templates.",
    whatYouSee:
      "Search Console's Manual Actions report shows a 'Pure Spam' or 'Thin content' entry with either a site-wide or partial-match scope. Partial matches name affected URL patterns; site-wide matches do not. Within a day or two of the action landing, the affected templates fall out of the top 100 entirely — this is suppression, not a ranking adjustment, so positions go to null rather than dropping a few places. Branded queries usually survive; everything non-branded on the flagged templates evaporates. Unlike an algorithmic hit, you get an explicit notification and a reconsideration channel, which means recovery is gated by a human reviewer rather than the next core update.",
    likelyCauses: [
      {
        cause: "Programmatic pages with no information a human would value",
        explanation:
          "Pure Spam actions land on templates where the generated pages exist only to capture a keyword permutation — entity-swap pages, auto-generated location or category pages with no unique data, or scraped-then-spun content. The reviewer's test is whether the page would exist if search engines did not. If the honest answer is no, the action stands until those pages are gone or genuinely rebuilt.",
      },
      {
        cause: "Scaled content abuse: thousands of near-identical pages shipped fast",
        explanation:
          "The March 2024 scaled-content-abuse policy made volume itself a signal. A site that adds 20,000 templated pages in a quarter, each sharing >70% boilerplate, reads as an abuse pattern even if any single page looks borderline acceptable. Reviewers see the aggregate, not the individual URL, so a fix that touches only a handful of sample pages will not clear the action.",
      },
      {
        cause: "Sneaky redirects, cloaking, or doorway sets feeding a money page",
        explanation:
          "Doorway pages — large sets of similar pages that all funnel the user to the same destination — are an explicit Pure Spam trigger. If your programmatic pages exist mainly to rank and then push the visitor to a single conversion page, the reviewer will classify the whole set as doorways regardless of how polished each page looks.",
      },
      {
        cause: "Expired-domain or subfolder abuse inherited from a prior owner",
        explanation:
          "If the domain or a subfolder was previously used for spam, the manual action can attach to history you did not create. This is common after acquisitions. The fix is the same — remove or rebuild the offending content — but the reconsideration request must explicitly document the ownership change and what was removed.",
      },
    ],
    diagnosticSteps: [
      "Open Search Console → Security & Manual Actions → Manual Actions. Record the exact label ('Pure Spam' vs 'Thin content') and whether the scope is site-wide or partial — partial actions list the affected URL patterns you must focus on.",
      "Map the named patterns (or, for site-wide, your largest templates) to path prefixes and parameter shapes so you know precisely which page sets the reviewer is judging.",
      "Run pseolint against the affected templates and read the spam-cluster findings first — doorway-pattern, near-duplicate, thin-content, and boilerplate-ratio are the rules that correspond to Pure Spam reasoning.",
      "Sample 25 random URLs per affected template and apply the human test to each: would this page exist if search did not? Tally the pass rate — below ~70% means the template needs rebuilding, not editing.",
      "Decide per template: rebuild with genuine per-page data, consolidate many thin pages into fewer substantive ones, or remove and 410. Do not noindex-and-leave; reviewers want the spam gone, not merely hidden.",
      "Ship the fixes site-wide before filing — a reconsideration filed while spam still exists on unflagged templates is the most common rejection reason.",
      "File the reconsideration request with a specific, honest writeup: what was wrong, the scope of pages changed, links to before/after examples, and how you will prevent recurrence. Vague requests are rejected and reset the queue.",
    ],
    relatedRules: ["doorway-pattern", "thin-content", "near-duplicate", "boilerplate-ratio"],
    caseStudy:
      "A travel-deals site received a site-wide Pure Spam action covering ~40,000 auto-generated '{city} cheap flights' pages that each wrapped an affiliate widget in spun boilerplate. The team deleted 38,000 of them with 410s, rebuilt 2,000 top-demand routes with real fare-history data, median prices, and editorial route notes, and removed two doorway funnel pages. Their first reconsideration was rejected for residual thin pages on a forgotten subdomain; the second, filed 18 days later after cleaning the subdomain, was approved. Non-branded organic recovered to 58% of pre-action levels over the following 90 days as the rebuilt pages re-earned rankings on merit.",
    faqs: [
      {
        q: "How long does a Pure Spam reconsideration take?",
        a: "Reviews typically take one to three weeks per submission, and there is no partial credit — a request is approved or rejected as a whole. A rejection sends you to the back of the queue, so the dominant strategy is to over-fix before the first filing rather than iterate. Manual actions are reviewed by people, so a clear, specific request with concrete examples is reviewed faster than a vague one.",
      },
      {
        q: "Can I just noindex the spam pages instead of deleting them?",
        a: "Noindex hides pages from the index but does not remove the spam pattern the reviewer is judging, and reviewers can still see noindexed URLs. For Pure Spam, the reliable path is to remove the pages (410) or rebuild them into something with genuine added value. Noindex is acceptable only as a temporary step while substantive rebuilds ship.",
      },
      {
        q: "Will fixing the manual action restore my old rankings?",
        a: "Lifting the action removes the suppression, but it does not restore rankings the pages no longer deserve. If you deleted or consolidated the spam, the surviving pages re-rank on their own merit, which is usually a fraction of the pre-action footprint. Plan for recovery to the level your genuinely-useful pages can earn, not to the inflated pre-action numbers.",
      },
      {
        q: "I bought this domain with the action already on it — what do I do?",
        a: "Treat inherited actions the same way operationally: find and remove the offending content. The difference is in the reconsideration request, where you should document the ownership transfer date, state that you did not create the content, and detail exactly what you removed. Google does penalize sites for inherited spam, but a documented cleanup plus ownership change is a well-recognized, recoverable case.",
      },
      {
        q: "Should I disavow links after a Pure Spam action?",
        a: "Pure Spam is about your own content, not your backlink profile, so disavowal is usually irrelevant and can do harm if applied carelessly. Only consider a disavow file if the action is specifically 'Unnatural links to your site.' For Pure Spam, spend your effort on removing or rebuilding the thin and doorway pages that triggered it.",
      },
    ],
    recoveryTimeline:
      "Recovery has two clocks. The first is the reconsideration cycle: one to three weeks per submission, with rejections resetting the queue — so realistic clearance is two to six weeks if your first filing is thorough, longer if you iterate. The second is the ranking clock: once the action lifts, the surviving pages must re-earn position on merit, which lands over the following 30 to 90 days as Google recrawls and rescores. Do not expect a snap-back to pre-action traffic; the spam pages that produced most of that traffic are gone by design. Track the Manual Actions report for the 'no issues detected' state, then watch the per-template Performance report for the recrawl-driven climb.",
  },
```

- [ ] **Step 2: Run the guardrail tests**

Run: `cd apps/web && bun run test -- marketing-symptoms`
Expected: PASS — the new entry clears both depth and integrity contracts (count is now ≥ 6).

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: PASS — entry conforms to `MarketingSymptom`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/marketing-symptoms.ts
git commit -m "feat(web): add manual-action-pure-spam symptom page"
```

---

## Task 4: New symptom — "traffic dropped but rankings unchanged"

The signature 2026 AI-Overview / SERP-feature query: positions look fine in rank trackers, but clicks collapse. High volume, high confusion, strong fit for the symptom front door. Full entry below.

**Files:**
- Modify: `apps/web/src/lib/marketing-symptoms.ts`

- [ ] **Step 1: Add the entry**

Insert this object into `MARKETING_SYMPTOMS`:

```ts
  {
    slug: "traffic-dropped-rankings-unchanged",
    title: "Traffic dropped but rankings unchanged — diagnose the click loss",
    metaDescription:
      "Positions look fine but clicks collapsed? Diagnose AI Overviews, SERP features, and intent shifts draining CTR from your programmatic pages.",
    primaryKeyword: "traffic dropped but rankings the same",
    oneLiner:
      "Average position in Search Console holds steady while clicks and CTR fall, meaning the rankings survived but the SERP changed shape around them.",
    whatYouSee:
      "In Search Console, the Performance report shows average position flat or even improving while clicks decline and impressions often stay level or rise. The CTR line is the tell: it drops steadily across queries that used to convert impressions into clicks. Third-party rank trackers agree you are still ranking, which is why this feels like a paradox. The loss concentrates on informational, top-of-funnel queries — 'what is', 'how to', 'best X for Y' — where an AI Overview or a featured snippet now answers the question above your result, while transactional and branded queries hold their click-through. The drop is gradual rather than a cliff, because SERP features roll out per-query over weeks rather than landing in a single update.",
    likelyCauses: [
      {
        cause: "AI Overviews answering the query before the user reaches your link",
        explanation:
          "On informational queries, an AI Overview synthesizes an answer from several sources at the top of the page. Users who get their answer never scroll to the organic results, so your position is unchanged but its click-through collapses. Programmatic informational templates — definitions, explainers, generic how-tos — are the most exposed, because their content is exactly what the overview can summarize in a sentence.",
      },
      {
        cause: "New SERP features pushing organic results below the fold",
        explanation:
          "Featured snippets, People-Also-Ask blocks, video carousels, and shopping units all consume vertical space above the classic blue links. When Google adds one of these to a query you rank for, your position number stays the same but its real estate moves down the page, and CTR falls accordingly. This is a layout change, not a quality penalty.",
      },
      {
        cause: "Intent shift: Google reinterpreted the query and your page no longer matches",
        explanation:
          "When the dominant intent for a query shifts — say from informational to transactional — Google reshapes the SERP toward the new intent. A page that still ranks on legacy signals can sit in a SERP whose users now want something it does not offer, so impressions persist but clicks dry up. The fix is matching the page to the current intent, not adding content.",
      },
      {
        cause: "Title and meta no longer competitive against richer results",
        explanation:
          "As neighbors adopt richer titles, structured data, and sitelinks, an older plain result loses relative appeal even at the same position. CTR is partly a beauty contest within the visible set, so a stale title or missing schema can bleed clicks slowly without any change to ranking. This is the most directly fixable cause on this list.",
      },
    ],
    diagnosticSteps: [
      "In Search Console, compare two equal date ranges before and after the decline and add the CTR and Position columns — confirm position is flat or improving while CTR falls, which separates this symptom from a true ranking drop.",
      "Sort affected queries by lost clicks and classify each as informational, transactional, or branded — a concentration of loss on informational queries points squarely at AI Overviews or snippets.",
      "Hand-check the live SERPs for your top five losing queries and record what now sits above the organic results (AI Overview, featured snippet, PAA, carousel, shopping unit).",
      "For queries where you ARE the snippet or overview source, accept the displayed-but-not-clicked tradeoff and pivot the page toward a follow-on action; for queries where a competitor is the source, evaluate whether you can win that feature instead.",
      "Run pseolint on the affected templates to confirm the pages are not also tripping quality rules — rule out a coincident algorithmic issue before attributing the entire loss to SERP features.",
      "Rewrite titles and meta descriptions on high-impression, low-CTR pages and add or repair structured data (FAQ, HowTo, Product) so your result competes harder within the visible set.",
      "Shift measurement and content strategy toward queries with commercial intent and lower AI-Overview coverage, where a click is still both available and valuable.",
    ],
    relatedRules: ["thin-content", "template-diversity"],
    caseStudy:
      "A SaaS comparison site saw organic clicks fall 34% over two months while average position improved from 4.1 to 3.6. CTR analysis showed the loss was almost entirely on 'what is {category}' and 'how does {feature} work' templates, where AI Overviews had appeared on 80% of tracked queries. Rather than chase the lost informational clicks, the team consolidated forty thin explainer pages into ten substantive guides, rebuilt their '{tool} vs {tool}' transactional templates with original benchmark data, and added FAQ schema. Informational traffic stayed depressed, but transactional clicks rose 22% and trial signups — the metric that actually mattered — increased 15% over the next quarter.",
    faqs: [
      {
        q: "Is this a Google penalty?",
        a: "No. A penalty or algorithmic suppression shows up as falling positions, often a cliff. Flat positions with falling CTR is a SERP-shape change — AI Overviews, snippets, or other features capturing the click above you. It is not a quality signal against your site, which is why the diagnostic and the fix are completely different from a core-update recovery.",
      },
      {
        q: "Can I opt out of AI Overviews to get my clicks back?",
        a: "There is no reliable opt-in/opt-out that preserves rankings; the nosnippet and max-snippet directives can limit how your content is used but tend to reduce visibility overall, which usually costs more clicks than it saves. The durable response is to shift effort toward queries where a click is still available — commercial-intent and branded terms — rather than fighting for informational clicks the overview now absorbs.",
      },
      {
        q: "Should I delete the informational pages that lost traffic?",
        a: "Not reflexively. Pages that still earn impressions are building topical authority and may feed your transactional pages through internal links, even if their direct clicks fell. Consolidate genuinely thin explainers into stronger guides, but keep substantive informational content that supports the rest of the site. Delete only pages that were thin to begin with.",
      },
      {
        q: "How do I know if it's AI Overviews specifically versus a featured snippet?",
        a: "Check the live SERP for the affected query. An AI Overview is a generated multi-sentence answer block, often citing several sources; a featured snippet is a single extracted passage from one ranking page. Both depress organic CTR, but if you are the snippet source you still own the box, whereas an overview can answer without sending the click to anyone. The remedy differs, so confirm which one you are facing.",
      },
    ],
    recoveryTimeline:
      "This is the symptom least likely to fully 'recover' in the old sense, because the cause is a permanent change in SERP layout rather than a temporary suppression you can reverse. Expect the informational clicks lost to AI Overviews to stay lost; the realistic win is reallocating effort to queries where clicks remain available, which pays off over one to two quarters as rebuilt transactional pages climb. Title, meta, and structured-data fixes are the exception — they can recover CTR on affected pages within a single recrawl cycle of one to three weeks. Track CTR per query cohort (informational vs transactional) rather than total clicks, so you can see the healthy cohort growing even while the AI-absorbed cohort stays flat.",
  },
```

- [ ] **Step 2: Run the guardrail tests**

Run: `cd apps/web && bun run test -- marketing-symptoms`
Expected: PASS (count ≥ 7).

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/marketing-symptoms.ts
git commit -m "feat(web): add traffic-dropped-rankings-unchanged symptom page"
```

---

## Task 5: New symptom — "new programmatic pages won't get indexed"

The pre-penalty crawl-budget query — operators publishing at scale who hit "Discovered/Crawled — currently not indexed." Directly on-ICP. Full entry below.

**Files:**
- Modify: `apps/web/src/lib/marketing-symptoms.ts`

- [ ] **Step 1: Add the entry**

Insert this object into `MARKETING_SYMPTOMS`:

```ts
  {
    slug: "new-pages-not-getting-indexed",
    title: "New programmatic pages won't get indexed — diagnose the crawl gap",
    metaDescription:
      "You published thousands of pages and Google won't index them. Diagnose 'Discovered/Crawled — currently not indexed' and fix the crawl and quality signals.",
    primaryKeyword: "pages not getting indexed",
    oneLiner:
      "Newly published programmatic pages stall in Search Console's 'Discovered — currently not indexed' or 'Crawled — currently not indexed' buckets instead of entering the index.",
    whatYouSee:
      "After shipping a large batch of programmatic pages, Search Console's Page indexing report shows the declared URLs piling up under 'Discovered — currently not indexed' (Google saw the URL in your sitemap but has not crawled it) or 'Crawled — currently not indexed' (Google fetched it and chose not to keep it). The indexed count barely moves no matter how many URLs you submit. Manual 'Request indexing' may push a single page in, but the batch as a whole stays out. There is no penalty notification because this is not a penalty — it is Google declining to spend crawl budget and index slots on pages it does not yet judge worth keeping. The Discovered bucket usually grows first; the Crawled-not-indexed bucket grows as Google samples a few and is unimpressed.",
    likelyCauses: [
      {
        cause: "Per-page quality below the threshold Google will spend an index slot on",
        explanation:
          "'Crawled — currently not indexed' is most often a soft quality signal: Google fetched the page, compared it to what is already indexed, and decided it adds nothing. Templated pages that differ only by a swapped entity, or that are thin relative to competing results, get sampled and dropped. Submitting more of them does not help, because the model's objection is to the template, not the discovery path.",
      },
      {
        cause: "Crawl budget exhausted by low-value or duplicate URLs",
        explanation:
          "If your site exposes large numbers of parameter permutations, faceted-navigation combinations, or near-duplicate URLs, Googlebot spends its budget crawling noise and never reaches the pages you care about. This shows up as 'Discovered — currently not indexed' at scale: the URLs are known but uncrawled because the crawl scheduler keeps deprioritizing them behind the noise.",
      },
      {
        cause: "Weak internal linking — orphaned pages reachable only via the sitemap",
        explanation:
          "A sitemap declares a URL exists; it does not signal that the URL matters. Pages reachable only through the sitemap, or buried behind deep pagination, receive almost no internal PageRank and read as unimportant. Google routinely leaves such pages in Discovered indefinitely. Pages need contextual internal links from already-indexed, authoritative pages to be prioritized for crawling.",
      },
      {
        cause: "New or low-authority domain with little crawl trust",
        explanation:
          "Crawl rate scales with site authority and history. A young domain that suddenly publishes tens of thousands of URLs is asking for crawl budget it has not yet earned, so Google indexes a trickle and waits to see whether the new content earns engagement. This is the single hardest cause to fix quickly, because it resolves with time and earned signals rather than a configuration change.",
      },
    ],
    diagnosticSteps: [
      "In Search Console's Page indexing report, separate the two buckets: 'Discovered — currently not indexed' (a crawl-priority problem) versus 'Crawled — currently not indexed' (a quality problem). The dominant bucket tells you which branch to work.",
      "Use the URL Inspection tool on five stalled pages to confirm Google can fetch and render them — rule out a robots.txt block, noindex tag, or canonical pointing elsewhere before assuming a quality or budget cause.",
      "Audit your crawl surface for noise: count parameter permutations, faceted combinations, and duplicate URLs, and check the server log or Crawl Stats report for how much of Googlebot's budget they consume.",
      "Run pseolint on a sample of the stalled template and read thin-content and near-duplicate findings — if the template trips those rules, the Crawled-not-indexed bucket is a quality verdict you must fix at the template level.",
      "Map internal links into the stalled template: confirm each page is linked from at least one already-indexed, topically-relevant page, not only from the sitemap or a footer mega-menu.",
      "Trim the crawl surface (noindex or canonicalize the noise, block junk parameters) so Googlebot's budget reaches the pages that matter, then improve per-page value on the template itself.",
      "Resubmit the cleaned sitemap segment and let Google rediscover at its own pace; do not mass-click Request Indexing, which does not scale and is not the signal Google rewards for large batches.",
    ],
    relatedRules: ["thin-content", "near-duplicate", "template-diversity", "boilerplate-ratio"],
    caseStudy:
      "A real-estate listings startup published 60,000 '{neighborhood} homes for sale' pages on an eight-month-old domain and watched 52,000 of them sit in 'Discovered — currently not indexed' for weeks. Crawl Stats showed Googlebot burning most of its budget on sort-and-filter parameter URLs. The team canonicalized the parameter noise, added neighborhood pages as contextual links from indexed city hub pages, and enriched the template with per-neighborhood price trends and school data instead of a swapped place-name. Indexation climbed from 13% to 61% of declared URLs over ten weeks as crawl budget was freed and the template cleared the quality bar.",
    faqs: [
      {
        q: "What's the difference between 'Discovered' and 'Crawled — currently not indexed'?",
        a: "'Discovered — currently not indexed' means Google knows the URL exists (usually from your sitemap) but has not crawled it yet, which is a crawl-priority and budget problem. 'Crawled — currently not indexed' means Google fetched the page and decided not to index it, which is usually a soft quality verdict. The two require different fixes: budget and internal linking for the first, per-page value for the second.",
      },
      {
        q: "Will requesting indexing in Search Console fix this at scale?",
        a: "No. Request Indexing is a manual, per-URL tool with daily limits — useful for a handful of priority pages, useless for thousands. For large batches, the durable levers are improving page quality, trimming crawl-budget waste, and adding internal links so Google chooses to crawl and keep the pages on its own. Relying on manual submission is a sign the underlying signals still need work.",
      },
      {
        q: "How long should I wait before treating non-indexation as a problem?",
        a: "For an established domain, give a new batch two to four weeks before concluding the pages are stalled rather than merely queued. For a young or low-authority domain, indexation can legitimately take longer and arrive in waves. The signal that it is a real problem rather than normal lag is a flat indexed count while the Discovered or Crawled-not-indexed buckets keep growing.",
      },
      {
        q: "Could publishing so many pages at once have hurt me?",
        a: "Publishing a very large batch on a domain that has not earned proportional crawl trust often results in slow, partial indexing rather than a penalty — Google simply meters how much it takes. If the pages are also thin or near-duplicate, the large batch amplifies the quality signal and can spill into 'Crawled — currently not indexed' at scale. Shipping in smaller, higher-quality waves with strong internal links indexes more reliably than one massive drop.",
      },
    ],
    recoveryTimeline:
      "Indexation recovery is gradual and compounding rather than a single step change. Once you trim crawl waste and strengthen internal links, freed budget reaches stalled pages within two to four weeks and the Discovered bucket starts draining. Quality-driven 'Crawled — currently not indexed' cases take longer — Google must recrawl, re-evaluate the improved template, and decide it now merits a slot, typically over four to ten weeks. On young domains, expect indexation to climb in waves tied to earned engagement rather than on a fixed schedule. Track the ratio of indexed to declared URLs per template week over week; a steadily rising ratio means the fixes are working, while a flat ratio past ten weeks means the template still is not clearing the quality bar.",
  },
```

- [ ] **Step 2: Run the full test suite**

Run: `cd apps/web && bun run test`
Expected: PASS — all symptom guardrails green (count ≥ 8), no regressions elsewhere.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/marketing-symptoms.ts
git commit -m "feat(web): add new-pages-not-getting-indexed symptom page"
```

---

## Task 6: Sitemap coverage regression test

Guarantees every symptom entry is discoverable — a new entry that never reaches the sitemap is invisible to crawlers, which would silently waste the work.

**Files:**
- Create: `apps/web/tests/unit/sitemap-symptoms.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/sitemap-symptoms.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { MARKETING_SYMPTOMS } from "@/lib/marketing-symptoms";

describe("sitemap symptom coverage", () => {
  it("emits a URL for every marketing symptom", () => {
    const urls = sitemap().map((e) => e.url);
    for (const s of MARKETING_SYMPTOMS) {
      expect(urls.some((u) => u.endsWith(`/symptoms/${s.slug}`))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/web && bun run test -- sitemap-symptoms`
Expected: PASS — `sitemap.ts` already maps `MARKETING_SYMPTOMS`, so all eight slugs (5 launch + 3 new) appear.

Note: `sitemap()` reads `env().BETTER_AUTH_URL`. The vitest `setupFiles` (`tests/setup.ts`) already provisions env for the existing `env.test.ts`; if this test reports a missing env var, set `BETTER_AUTH_URL` in `tests/setup.ts` alongside the other test env values rather than mocking `env`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/unit/sitemap-symptoms.test.ts
git commit -m "test(web): assert sitemap covers every marketing symptom"
```

---

## Done criteria

- `cd apps/web && bun run test` — all green, with the depth + integrity guardrails covering 8 symptom entries and sitemap coverage asserted.
- `cd apps/web && bun run typecheck` — clean.
- Three new indexable pages live at `/symptoms/manual-action-pure-spam`, `/symptoms/traffic-dropped-rankings-unchanged`, `/symptoms/new-pages-not-getting-indexed`, each with Article/FAQ/HowTo JSON-LD and present in the sitemap.

## Out of scope (later slices)

- GSC-live integration and the measurement/kill-criteria instrumentation (spec §"Measurement & kill criteria").
- The throttled free tool wedge (spec kernel item 4).
- Full engine-against-built-HTML dogfood check (this slice enforces the contract at the data layer; a later slice can run `@pseolint/core` against the rendered pages in CI).
- Aggregate/anonymized-data content + the ToS/consent gate (spec kernel item 5).
- `/penalty-recovery/[type]` and `/core-update/[date]` route families (validate demand first).
