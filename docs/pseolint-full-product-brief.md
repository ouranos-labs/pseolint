# pseolint.dev: The pSEO Compliance Platform

## Full Product Brief (April 2026)

---

## Vision

The only platform purpose-built for programmatic SEO compliance. Fully open-source (MIT CLI + AGPL web app) under the `ouranos-labs` GitHub org. Revenue from the hosted service, not proprietary code. Category-defining product in a space where no tool currently exists.

**Model:** Supabase / Plausible / n8n, fully open-source codebase, revenue from hosted service. CLI drives npm adoption → hosted platform captures revenue.

---

## Brand

| Asset | Value |
|-------|-------|
| Product name | **pSEO Lint** |
| npm packages | `pseolint` (CLI), `@pseolint/core` (engine) |
| Domain | `pseolint.dev` (confirmed available, $13/yr) |
| Domain (redirect) | `pseolint.com` (confirmed available, $11.25/yr) |
| GitHub | `github.com/ouranos-labs/pseolint` (monorepo) |
| GitHub org | `ouranos-labs` (open-source projects org) |
| Tagline | "SpamBrain-proof your pSEO before you publish" |
| Alt tagline | "The only SEO tool that audits page relationships, not just pages" |
| Positioning | "ESLint for programmatic SEO" |
| License | MIT (packages/*), AGPL-3.0 (apps/web) |

Register: `pseolint.dev` (primary), `pseolint.com` (redirect). Hyphenated variants optional.

---

## Architecture: Three Layers

All code is open-source under `github.com/ouranos-labs/pseolint` (monorepo). Revenue comes from the hosted service, not proprietary code. Same model as Supabase, Plausible, n8n.

```
┌─────────────────────────────────────────────────────────┐
│                    LAYER 3: ECOSYSTEM                    │
│  GitHub Action · SpamBrain Badge · MCP Server · VS Code  │
│                      MIT license                         │
├─────────────────────────────────────────────────────────┤
│                 LAYER 2: HOSTED PLATFORM                 │
│  Dashboard · GSC Integration · Monitoring · Competitive  │
│  Audit · Pre-Publish Gate API · AI Fix Suggestions       │
│  PDF Reports · Score Trends · Alerts                     │
│              AGPL-3.0 · $14-24/month hosted              │
├─────────────────────────────────────────────────────────┤
│              LAYER 1: OPEN-SOURCE CLI                    │
│  npx pseolint ./out                                     │
│  30 rules · 6 categories · SpamBrain Risk Score          │
│  Console/JSON/Markdown output · CI exit codes            │
│                    MIT license                            │
└─────────────────────────────────────────────────────────┘
```

**Why fully open-source:**
- AGPL-3.0 on `apps/web` prevents competitors from hosting the dashboard without contributing back
- MIT on `packages/*` ensures maximum npm adoption with zero friction
- Self-hosting is possible but impractical (GSC OAuth, Trigger.dev jobs, Supabase, Redis): 95% will pay $14/mo
- Open codebase is a portfolio asset for job applications (visible on `ouranos-labs`, separate from personal `ouranos27`)
- Community-contributed rules via PR expand the rule set without solo maintenance burden

---

## Layer 1: Open-Source CLI (Free, MIT)

### What It Does

Audits a programmatic SEO site at the **page-set level**: analyzing relationships between pages, not individual URLs. Detects the exact patterns Google's SpamBrain targets.

### Input Modes

```bash
# Local build directory
npx pseolint ./out
npx pseolint ./.next/server/app
npx pseolint ./dist

# Live site via sitemap
npx pseolint https://paperforge.dev/sitemap.xml

# With data source comparison
npx pseolint ./out --data-source ./templates.json

# CI mode
npx pseolint ./out --threshold 40 --format json
```

### Rule Set: 30 Rules Across 6 Categories

#### Category 1: SpamBrain Risk Detection (THE DIFFERENTIATOR)

| Rule ID | What It Checks | Default Severity |
|---------|---------------|-----------------|
| `spam/near-duplicate` | SimHash similarity scoring between all page pairs. Flags pages >85% similar content. Uses 64-bit fingerprints with 3-word shingle windows. | Critical |
| `spam/entity-swap` | Detects doorway pages where only a proper noun changes. Masks all entities (cities, states, names, zips) with `[ENTITY]` placeholder, then recomputes similarity. If masked content matches → doorway page. | Critical |
| `spam/thin-content` | Word count per page (excluding nav/header/footer). Unique word ratio. Content depth score. Default minimum: 300 words. | Error |
| `spam/boilerplate-ratio` | Percentage of page content shared across the template set vs unique per page. Flags pages >70% boilerplate. Computes by extracting the "template skeleton" from the page set and measuring deviation. | Error |
| `spam/template-diversity` | Scores structural variation in DOM across pages. Identical HTML structure on every page = high risk. Measures tag tree depth variance, element count variance, section count. | Warning |
| `spam/publication-velocity` | Analyzes `lastmod` dates, `datePublished` schema, or file creation dates. Flags batches of >100 pages sharing the same publish date with no staggering. | Warning |
| `spam/doorway-pattern` | Composite rule: combines entity-swap + thin-content + identical structure + same meta description template. When all fire together → classic doorway pattern. This is the "red alert" rule. | Critical |

#### Category 2: Content Quality

| Rule ID | What It Checks | Default Severity |
|---------|---------------|-----------------|
| `content/unique-value` | Each page must contain ≥N words of content NOT found on any other page. Default: 100 unique words minimum. | Error |
| `content/heading-uniqueness` | H1 and H2 tags should not be identical across pages after entity masking. | Warning |
| `content/meta-uniqueness` | Title tags and meta descriptions must be unique per page. Flags templates where only the entity changes but the sentence structure is identical. | Error |
| `content/missing-author` | Checks for author schema, `<meta name="author">`, byline elements, or rel="author" links. Missing authorship is an E-E-A-T risk. | Warning |
| `content/eeat-signals` | Checks for about page links, author bio sections, credential mentions, cited sources, publication dates, last-updated dates. | Info |

#### Category 3: Internal Linking

| Rule ID | What It Checks | Default Severity |
|---------|---------------|-----------------|
| `links/orphan-pages` | Pages with zero inbound internal links. Unreachable by crawlers. | Error |
| `links/dead-ends` | Pages with zero outbound internal links. Users hit a wall. | Warning |
| `links/cluster-connectivity` | Groups pages by URL pattern or directory. Scores cross-linking between clusters. Isolated clusters = missed topical authority. | Warning |
| `links/link-depth` | Pages requiring >3 clicks from homepage or nearest hub page. Deep-buried pages get less crawl priority. | Info |
| `links/hub-pages` | Identifies URL patterns that suggest generated page sets, then checks whether an index/hub page exists linking to all children. Missing hubs = orphan clusters. | Warning |

#### Category 4: Technical SEO

| Rule ID | What It Checks | Default Severity |
|---------|---------------|-----------------|
| `tech/sitemap-completeness` | Compares sitemap URLs against pages discovered in build directory or via crawl. Flags missing pages and phantom URLs. | Error |
| `tech/canonical-consistency` | Every page must have a canonical URL. Self-referencing canonicals must match the actual URL. Cross-domain canonicals flagged for review. | Error |
| `tech/robots-compliance` | Checks robots.txt against sitemap. Pages in sitemap but blocked by robots.txt = conflict. | Error |
| `tech/og-completeness` | Every page needs og:title, og:description, og:image. Flags pages missing any of the three. | Warning |
| `tech/hreflang-consistency` | If any page has hreflang, validates reciprocity (A→B requires B→A). Flags broken or incomplete hreflang implementation. | Warning |
| `tech/noindex-conflict` | Pages in sitemap but carrying noindex meta tag or x-robots-tag. Contradictory signal to crawlers. | Error |

#### Category 5: Structured Data

| Rule ID | What It Checks | Default Severity |
|---------|---------------|-----------------|
| `schema/json-ld-valid` | Validates JSON-LD syntax. Catches malformed JSON, missing @context, invalid @type values. | Error |
| `schema/required-fields` | Per schema type: Article needs headline+author+datePublished, Product needs name+price, FAQ needs mainEntity. | Warning |
| `schema/consistency` | All pages in a template set should use the same schema type. Mixed types across a programmatic set = confusing signals. | Info |

#### Category 6: Cannibalization

| Rule ID | What It Checks | Default Severity |
|---------|---------------|-----------------|
| `cannibal/title-overlap` | Flags page pairs with >80% title similarity after entity masking. Two pages competing for the same SERP. | Warning |
| `cannibal/keyword-collision` | Extracts top 10 keywords per page via TF-IDF. Flags pages sharing >6 of their top 10 keywords. | Warning |
| `cannibal/url-pattern` | Detects URL structures that create ambiguous intent overlap. E.g., `/templates/california-llc` vs `/templates/llc-california`. | Info |

### SpamBrain Risk Score

| Score | Label | CI Exit | Meaning |
|-------|-------|---------|---------|
| 0-20 | ✅ Safe | 0 | Low risk. Ship confidently. |
| 21-40 | ⚠️ Caution | 0 | Review flagged items. Probably fine. |
| 41-60 | 🟠 Risky | 1 | Significant rework needed. Don't publish yet. |
| 61-80 | 🔴 Dangerous | 1 | High probability of penalties. |
| 81-100 | ☠️ Critical | 1 | Matches known penalized patterns. Do not publish. |

**Weighted formula:**

```
score = (spam_score × 0.40) + (content_score × 0.25) + (links_score × 0.15)
      + (tech_score × 0.10) + (schema_score × 0.05) + (cannibal_score × 0.05)
```

### Configuration

```typescript
// pseolint.config.ts
import { defineConfig } from 'pseolint';

export default defineConfig({
  source: './out',
  sitemap: '/sitemap.xml',
  dataSource: './data/templates.json',

  entities: {
    patterns: [
      /\b(Alabama|Alaska|Arizona|Arkansas|California|...)\b/gi,
      /\b\d{5}\b/g,
    ],
    fields: ['state', 'city', 'zip'],
  },

  rules: {
    'spam/near-duplicate': { threshold: 0.85, severity: 'critical' },
    'spam/thin-content': { minWords: 300, severity: 'error' },
    'spam/boilerplate-ratio': { maxRatio: 0.70, severity: 'error' },
    'spam/publication-velocity': { maxPerDay: 100, severity: 'warning' },
    'content/unique-value': { minUniqueWords: 100, severity: 'error' },
    'links/orphan-pages': { severity: 'error' },
  },

  scoring: {
    threshold: 40,
    weights: {
      spam: 0.40,
      content: 0.25,
      links: 0.15,
      tech: 0.10,
      schema: 0.05,
      cannibal: 0.05,
    },
  },

  concurrency: 5,
  sampleSize: 500,
  timeout: 30000,

  ignore: ['/api/**', '/admin/**', '/_next/**'],
});
```

### Output Formats

```bash
npx pseolint ./out                     # colored terminal (default)
npx pseolint ./out --format json       # CI-friendly
npx pseolint ./out --format markdown   # PRs and docs
npx pseolint ./out --format html       # visual report (local file)
```

### Console Output Example

```
  pseolint v1.0.0: Auditing 4,771 pages

  ╭──────────────────────────────────────────╮
  │  SpamBrain Risk Score:  32/100 ⚠️ Caution │
  ╰──────────────────────────────────────────╯

  spam     ████████░░  38/100   3 critical, 2 errors
  content  ██████░░░░  28/100   1 error, 4 warnings
  links    ████░░░░░░  22/100   12 warnings
  tech     ██░░░░░░░░  15/100   2 errors
  schema   ███░░░░░░░  18/100   4 warnings
  cannibal █████░░░░░  31/100   8 warnings

  ── Critical ──────────────────────────────
  ✖ spam/entity-swap  847 pages are structurally identical
    after masking state names. Clusters:
    /templates/[state]-llc (50 pages)
    /templates/[state]-corporation (50 pages)
    → Add state-specific legal requirements,
      filing fees, and processing times per page.

  ✖ spam/doorway-pattern  127 pages flagged as
    classic doorway pages (entity-swap + thin + 
    identical meta descriptions).
    Worst cluster: /templates/[state]-dba

  ── Errors ────────────────────────────────
  ✖ spam/thin-content  312 pages below 300 words
    Average: 187 words. Worst: /templates/wyoming-trademark (43 words)

  ✖ content/meta-uniqueness  4,200 pages share
    meta description template:
    "Generate your [state] [doctype] template..."
    Only entity name varies.

  ── Warnings (26 total, showing top 5) ────
  ⚠ links/orphan-pages  89 pages have no inbound links
  ⚠ cannibal/keyword-collision  34 page pairs competing
  ⚠ spam/template-diversity  DOM structure score: 0.12
  ⚠ content/heading-uniqueness  H1 identical on 3,800 pages
  ⚠ links/dead-ends  445 pages have no outbound links

  Detailed report: pseolint-report.json
  Dashboard: https://pseolint.dev/report/abc123
```

---

## Layer 2: Hosted Platform ($14-24/mo)

### What the CLI Can't Do

The CLI is a snapshot. Run it, get a score, fix issues, run again. But pSEO sites are alive; you publish new pages, Google re-crawls, SpamBrain re-evaluates. You need continuous monitoring, not one-time audits.

The hosted platform is everything that requires persistence, scheduling, external APIs, and shared access.

### Features

#### 2.1 Dashboard + Score History

- Visual dashboard showing SpamBrain Risk Score over time
- Score trend chart (weekly/monthly)
- Per-category breakdowns with drill-down to specific rules
- "Regressions" view: what changed since last audit
- Project-level organization (multiple sites per account)

#### 2.2 Google Search Console Integration (THE KILLER FEATURE)

This is what no CLI can do and what pSEO operators desperately need.

**Index Coverage Gap Analysis:**
- Pull indexed page count from GSC API
- Compare against your sitemap: "You have 4,771 pages. Google indexed 2,134. Here are the 2,637 pages that aren't indexed and why."
- Categorize unindexed pages: "Crawled but not indexed" (quality signal), "Discovered but not crawled" (budget signal), "Blocked by robots.txt" (config error), "Excluded by noindex" (intentional or bug)

**Correlation Analysis:**
- Map SpamBrain Risk Score against GSC indexing rate
- Show which rule violations correlate with indexing failures
- "Pages flagged by `spam/entity-swap` have a 73% non-indexing rate vs 12% for unflagged pages"

**Crawl Budget Intelligence:**
- Track Googlebot crawl frequency per URL pattern
- Identify which page clusters are being crawled vs ignored
- Alert when crawl frequency drops on a section (early SpamBrain signal)

**Performance per Page Cluster:**
- Group GSC impressions/clicks by URL pattern
- Show which template sets are performing vs dead weight
- "Your /templates/[state]-llc pages get 12,400 impressions/month. Your /templates/[state]-dba pages get 47. Consider consolidating."

#### 2.3 Continuous Monitoring + Alerts

- Scheduled weekly audits (configurable frequency)
- Webhook + email alerts when:
  - SpamBrain Risk Score increases by >10 points
  - New critical rule violations appear
  - GSC index coverage drops by >5%
  - Crawl frequency drops on a page cluster
- Integration with Slack/Discord for alerts (via webhook URL)

#### 2.4 Competitive Auditing

- Plug in any public pSEO site's sitemap
- Get their SpamBrain Risk Score
- Side-by-side comparison: your site vs competitor
- Identify competitor weaknesses you can exploit
- "Competitor X has 2,000 city pages with a SpamBrain risk of 78. Yours is 32. Their pages will get hit before yours."
- Limited to 5 competitor sites on Pro, 15 on Team

#### 2.5 Pre-Publish Gate API

```bash
# In your deployment pipeline (GitHub Actions, Vercel, Coolify)
curl -X POST https://api.pseolint.dev/v1/audit \
  -H "Authorization: Bearer $PSEOLINT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sitemap": "https://staging.paperforge.dev/sitemap.xml", "threshold": 40}'

# Response:
# { "score": 32, "pass": true, "report_url": "https://pseolint.dev/report/abc123" }
```

- Runs full audit on staging/preview URL before production deploy
- Returns pass/fail based on configured threshold
- Compares against baseline from last production audit
- Reports score *diff*: "Score went from 28 to 35 (+7) due to 50 new thin pages"
- Blocks deploy if threshold exceeded
- GitHub Checks API integration (shows pass/fail on PR)

#### 2.6 AI-Powered Fix Suggestions

For each flagged rule, generate specific, actionable fixes:

- Uses OpenRouter (Claude/GPT) with page content as context
- **Entity-swap fix:** "These 50 state LLC pages are identical after masking. Here's a unique paragraph for each state based on that state's specific LLC filing requirements, fees, and processing times."
- **Thin content fix:** "This page has 187 words. Here are 3 content sections you could add: state-specific regulations, comparison table with neighboring states, FAQ based on real search queries."
- **Meta description fix:** "Instead of the template 'Generate your [state] [doctype]...', here are 50 unique meta descriptions that include state-specific angles."
- Rate-limited to prevent abuse. Included in Pro/Team tiers.

#### 2.7 Shareable Reports

- Branded PDF export of any audit
- Shareable URL (public link with optional password)
- Embeddable report widget for client dashboards
- White-label option on Team tier (remove pSEO Lint branding)

### Pricing

| Tier | Price | Audits | GSC | Monitoring | Competitors | Gate API | AI Fixes |
|------|-------|--------|-----|------------|-------------|----------|----------|
| **Free** | $0 | 1 manual/month |: | (|) | (|) |
| **Pro** | $14/mo | Unlimited | ✅ 1 site | Weekly | 5 sites | ✅ | 50/month |
| **Team** | $24/mo | Unlimited | ✅ 5 sites | Daily | 15 sites | ✅ | 200/month |

Payments via Polar.sh. One-time audit reports available for $7 (like BrandCheck model) for users who don't want a subscription.

---

## Layer 3: Ecosystem

### 3.1 GitHub Action

Published from `packages/action/` in the monorepo. Two options for distribution:

**Option A (preferred): Release branch in monorepo**
- CI builds `packages/action/` → compiles to `dist/`
- Pushes compiled output to a `releases/action/v1` branch
- Users reference: `uses: ouranos-labs/pseolint@action-v1`

**Option B: Thin release repo (if Marketplace requires it)**
- CI auto-pushes compiled action to `ouranos-labs/pseolint-action`
- Users reference: `uses: ouranos-labs/pseolint-action@v1`

```yaml
# .github/workflows/pseolint.yml
name: pSEO Lint
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm run build  # build your static site
      - uses: ouranos-labs/pseolint-action@v1
        with:
          source: ./out
          threshold: 40
          token: ${{ secrets.PSEOLINT_TOKEN }}  # optional: for hosted reporting
```

- Comments on PR with score summary + diff from main branch
- Blocks merge if score exceeds threshold
- Links to full hosted report (if token provided)
- Free for open-source repos, requires Pro/Team for private repos

### 3.2 SpamBrain Score Badge

```markdown
<!-- In your README or landing page -->
![SpamBrain Score](https://pseolint.dev/badge/paperforge.dev.svg)
```

- Live SVG badge showing current score + label
- Updates after each audit
- Color-coded: green (0-20), yellow (21-40), orange (41-60), red (61+)
- Free for all users (viral distribution mechanism)
- Clicking the badge links to pseolint.dev (attribution + signup funnel)

### 3.3 MCP Server

```json
{
  "mcpServers": {
    "pseolint": {
      "command": "npx",
      "args": ["pseolint", "--mcp"]
    }
  }
}
```

Tools exposed:
- `audit_site`: run full audit from Claude Code/Cursor
- `check_page`: quick check single page against rules
- `explain_score`: explain what's driving the score
- `suggest_fixes`: AI-powered fix suggestions for flagged rules

### 3.4 VS Code Extension (Low Priority, Post-Traction)

- Inline warnings on template files
- Score in status bar
- Quick-fix suggestions

---

## Technical Architecture

### Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **CLI** | TypeScript + Commander | Dev-native, type-safe |
| **HTML parsing** | Cheerio | Fast, no browser needed |
| **Similarity** | Custom SimHash + Jaccard | Lightweight, O(1) comparison |
| **Keyword extraction** | Custom TF-IDF | No heavy NLP deps |
| **Config** | Cosmiconfig + Zod | Standard loading + validation |
| **Output** | Chalk + custom formatters | Console, JSON, MD, HTML |
| **HTTP** | Undici / native fetch | Fast concurrent crawling |
| **Testing** | Vitest | Fast, TS-native |
| **Web app** | Next.js 15 | Your standard stack |
| **Auth** | Better Auth | Your standard stack |
| **DB** | Supabase + Drizzle | Your standard stack |
| **Payments** | Polar.sh | Your standard stack |
| **Jobs** | Trigger.dev | Scheduled audits, GSC sync |
| **Cache** | Upstash Redis | Rate limiting, audit caching |
| **AI** | Vercel AI SDK + OpenRouter | Fix suggestions |
| **Email** | Resend | Alerts, reports |
| **Infra** | Coolify on Hostinger VPS | Your standard stack |
| **Analytics** | OpenPanel | Your standard stack |

### Core Algorithms

#### SimHash (Near-Duplicate Detection)

```
Input: HTML page
Steps:
  1. Extract text (strip tags, nav, header, footer via semantic selectors)
  2. Tokenize into 3-word shingles: ["the quick brown", "quick brown fox", ...]
  3. Hash each shingle → 64-bit integer
  4. For each bit position (0-63):
     - Sum +1 for each shingle hash with bit=1
     - Sum -1 for each shingle hash with bit=0
  5. Final fingerprint: bit=1 if sum>0, bit=0 if sum≤0
  
Comparison: Hamming distance between two 64-bit fingerprints
  - Distance 0 = identical
  - Distance 1-3 = near-duplicate (>95% similar)
  - Distance 4-10 = similar
  - Distance >10 = different

Complexity: O(n) per page, O(n²) for all-pairs comparison
  - 5,000 pages = ~12.5M comparisons at ~1 nanosecond each = <1 second
```

#### Entity Masking

```
Input: Page text + entity patterns (from config)
Steps:
  1. Apply all entity regex patterns
  2. Replace matches with [ENTITY_TYPE] placeholder
     "California LLC" → "[STATE] LLC"
     "90210" → "[ZIP]"
  3. Recompute SimHash on masked text
  4. Compare masked fingerprints across all pages
  5. If masked fingerprint matches → structural duplicate (only entities differ)
```

#### Content-to-Boilerplate Ratio

```
Input: Set of all pages from the same template
Steps:
  1. For each page, extract text blocks (paragraphs, list items, headings)
  2. Build a "template skeleton" = text blocks that appear in >80% of pages
  3. For each page:
     - boilerplate_words = words matching the skeleton
     - unique_words = words NOT in the skeleton
     - ratio = boilerplate_words / total_words
  4. Flag pages where ratio > threshold (default 0.70)
```

#### TF-IDF Keyword Extraction (Cannibalization)

```
Input: All pages in the audit set
Steps:
  1. For each page, tokenize text into words
  2. Compute term frequency (TF) per page
  3. Compute inverse document frequency (IDF) across all pages
  4. Top 10 keywords per page = highest TF-IDF scores
  5. For each page pair, compute keyword overlap
  6. Flag pairs sharing >6 of their top 10 keywords
```

### Monorepo Structure

Single repo: `github.com/ouranos-labs/pseolint`

Managed with pnpm workspaces + Turborepo. All packages publish independently to npm. One CI pipeline, one star count, one issue tracker.

```
ouranos-labs/pseolint/
├── packages/
│   ├── core/                       # npm: @pseolint/core (MIT)
│   │   ├── src/                    # Shared audit engine: importable by anyone
│   │   │   ├── auditor.ts          # Main orchestrator
│   │   │   ├── loader.ts           # Page loading (fs/http)
│   │   │   ├── parser.ts           # HTML → structured data
│   │   │   ├── scorer.ts           # Weighted scoring
│   │   │   ├── rules/
│   │   │   │   ├── spam/           # 7 rules
│   │   │   │   ├── content/        # 5 rules
│   │   │   │   ├── links/          # 5 rules
│   │   │   │   ├── tech/           # 6 rules
│   │   │   │   ├── schema/         # 3 rules
│   │   │   │   └── cannibal/       # 4 rules
│   │   │   ├── algorithms/
│   │   │   │   ├── simhash.ts
│   │   │   │   ├── jaccard.ts
│   │   │   │   ├── entity-mask.ts
│   │   │   │   └── tf-idf.ts
│   │   │   ├── formatters/
│   │   │   │   ├── console.ts
│   │   │   │   ├── json.ts
│   │   │   │   ├── markdown.ts
│   │   │   │   └── html.ts
│   │   │   └── types.ts
│   │   ├── LICENSE                 # MIT
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── cli/                        # npm: pseolint (MIT)
│   │   ├── src/                    # Thin wrapper around @pseolint/core
│   │   │   ├── cli.ts              # Commander entry point
│   │   │   ├── config.ts           # Cosmiconfig + Zod loading
│   │   │   ├── mcp.ts              # MCP server mode (--mcp flag)
│   │   │   └── index.ts            # Programmatic API re-export
│   │   ├── LICENSE                 # MIT
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── action/                     # GitHub Action (MIT)
│       ├── action.yml              # Action metadata
│       ├── src/
│       │   └── index.ts            # Runs CLI, posts PR comment
│       ├── LICENSE                 # MIT
│       └── package.json
├── apps/
│   └── web/                        # pseolint.dev hosted platform (AGPL-3.0)
│       ├── src/
│       │   ├── app/
│       │   │   ├── (marketing)/    # Landing page, docs, blog, /rules/* pSEO pages
│       │   │   ├── (dashboard)/    # Authenticated dashboard
│       │   │   │   ├── projects/
│       │   │   │   ├── audits/
│       │   │   │   ├── competitors/
│       │   │   │   ├── gsc/
│       │   │   │   └── settings/
│       │   │   └── api/
│       │   │       ├── v1/
│       │   │       │   ├── audit/  # Pre-publish gate API
│       │   │       │   ├── badge/  # SVG badge generator
│       │   │       │   └── webhook/# GSC webhook receiver
│       │   │       └── auth/       # Better Auth routes
│       │   ├── lib/
│       │   │   ├── db/             # Drizzle schema + client
│       │   │   ├── auth/           # Better Auth config
│       │   │   ├── polar/          # Polar.sh integration
│       │   │   ├── gsc/            # Google Search Console API client
│       │   │   ├── ai/             # OpenRouter fix suggestions
│       │   │   └── jobs/           # Trigger.dev scheduled audits + GSC sync
│       │   └── components/
│       │       ├── dashboard/
│       │       ├── reports/
│       │       └── marketing/
│       ├── LICENSE                 # AGPL-3.0
│       ├── package.json
│       └── next.config.ts
├── pnpm-workspace.yaml             # packages/*, apps/*
├── turbo.json                      # build, test, lint pipeline
├── .github/
│   └── workflows/
│       ├── ci.yml                  # Test + lint all packages
│       ├── release.yml             # Changesets → npm publish
│       └── action-release.yml      # Build + push compiled action dist
├── changeset/                      # Changesets config for versioning
├── LICENSE                         # MIT (root default for packages/*)
├── CONTRIBUTING.md
└── README.md
```

**Publishing pipeline:**
- `@changesets/cli` handles versioning across packages
- `pnpm changeset` → `pnpm changeset version` → `pnpm changeset publish`
- GitHub Action auto-publishes on merge to main when changesets are present
- `packages/action/` builds to `dist/` and gets pushed to a release branch (or thin release repo `ouranos-labs/pseolint-action` if GitHub Marketplace requires it)

**Dependency graph:**
```
@pseolint/core  ←  pseolint (CLI)  ←  action
                 ←  apps/web (imports core directly via workspace)
```

Core has zero internal dependencies. CLI depends on core. Action depends on CLI. Web app imports core directly via pnpm workspace protocol.

### Database Schema (Drizzle)

```typescript
// Core tables
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  sitemapUrl: text('sitemap_url'),
  gscPropertyUrl: text('gsc_property_url'),
  config: jsonb('config'),                    // pseolint.config overrides
  createdAt: timestamp('created_at').defaultNow(),
});

export const audits = pgTable('audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  source: text('source').notNull(),           // 'cli' | 'scheduled' | 'api' | 'manual'
  score: integer('score').notNull(),          // 0-100
  categoryScores: jsonb('category_scores'),   // { spam: 38, content: 28, ... }
  pageCount: integer('page_count').notNull(),
  ruleResults: jsonb('rule_results'),         // full audit results
  summary: text('summary'),                   // AI-generated summary
  createdAt: timestamp('created_at').defaultNow(),
});

export const competitors = pgTable('competitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  sitemapUrl: text('sitemap_url').notNull(),
  lastScore: integer('last_score'),
  lastAuditId: uuid('last_audit_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const gscSnapshots = pgTable('gsc_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  indexedPages: integer('indexed_pages'),
  crawledNotIndexed: integer('crawled_not_indexed'),
  discoveredNotCrawled: integer('discovered_not_crawled'),
  excludedNoindex: integer('excluded_noindex'),
  totalPages: integer('total_pages'),
  coverageData: jsonb('coverage_data'),       // per-URL breakdown
  createdAt: timestamp('created_at').defaultNow(),
});

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  type: text('type').notNull(),               // 'score_spike' | 'index_drop' | 'crawl_drop' | 'new_critical'
  severity: text('severity').notNull(),
  message: text('message').notNull(),
  data: jsonb('data'),
  acknowledged: boolean('acknowledged').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
```

---

## Go-to-Market

### Phase 1: CLI Launch (Week 4)

**Channels:**
- ProductHunt: "ESLint for programmatic SEO: SpamBrain-proof your site before publishing"
- Hacker News: "Show HN: Open-source SpamBrain risk detector: I built it after Google nuked 80% of pSEO pages in March"
- r/SEO, r/TechSEO: "After the March 2026 update, I open-sourced a tool to catch the exact patterns SpamBrain targets"
- r/nextjs, r/webdev: Developer angle: "Open-source CI tool for pSEO sites"
- Twitter/X: Build-in-public thread + tag SEO accounts
- DEV.to: Tutorial: "How to audit your programmatic SEO site for SpamBrain risk"
- GitHub: ouranos-labs/pseolint: comprehensive README, contributing guide, rule documentation

**Case study:** Run on PaperForge, publish findings: "We ran pseolint on our 4,771-page template site. Score: 32. Here's what we found and fixed."

### Phase 2: Platform Launch (Week 8)

- Announce GSC integration as the headline feature
- Free tier gets 1 manual audit/month (conversion funnel)
- Blog post: "We tracked 50 pSEO sites through the March 2026 update. Here's what survived and why."
- Partner with SEO newsletter (Search Engine Journal, Ahrefs blog) for coverage

### Phase 3: Ecosystem (Ongoing)

- GitHub Action launch
- SpamBrain badge goes viral in README files
- MCP server for Claude Code/Cursor users
- Community-contributed rules (extensible rule API)

### pSEO for pseolint.dev Itself

Landing page targets:
- "spambrain audit tool"
- "programmatic seo checker"
- "pseo lint"
- "google spam update checker"
- "doorway page detector"
- "near duplicate content checker"
- "spambrain risk score"

Long-tail pages (small pSEO set):
- /rules/[rule-id]: one page per rule explaining what it checks, why it matters, how to fix
- /guides/[framework]: "pSEO compliance for Next.js", "pSEO compliance for Astro", etc.
- /updates/[update-name]: analysis of each Google spam update

---

## Build Timeline

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1 | Core engine: SimHash, entity masking, parser | Working similarity detection on PaperForge data |
| 2 | SpamBrain rules (7) + Content rules (5) | 12 rules passing tests |
| 3 | Tech + Links + Cannibal + Schema rules (12) | Full 30-rule CLI, all tests green |
| 4 | CLI polish + formatters + config + README + PaperForge case study | **CLI v1.0 launch** |
| 5 | Web app scaffold: auth, DB, dashboard shell, Polar integration | Authenticated dashboard with project CRUD |
| 6 | Hosted auditing: run audits from dashboard, store results, score trends | Working hosted audits with history |
| 7 | GSC integration: OAuth, index coverage, crawl data sync | **The killer feature live** |
| 8 | Competitive auditing + pre-publish gate API + alerts | **Platform v1.0 launch** |
| 9 | GitHub Action + badge SVG generator | Ecosystem pieces |
| 10 | MCP server + polish + docs | Full ecosystem |

**Total: 10 weeks from zero to full platform with open-source CLI + paid SaaS + ecosystem.**

---

## Success Metrics

| Metric | 30 days | 90 days | 180 days |
|--------|---------|---------|----------|
| npm weekly downloads | 500 | 2,000 | 5,000 |
| GitHub stars | 200 | 1,000 | 3,000 |
| Free accounts | 50 | 300 | 1,000 |
| Paid subscribers |: | 30 | 100 |
| MRR |: | $420 | $1,400 |

Conservative estimates. The npm install base is the leading indicator; everything else flows from it.

---

## Why This Wins

1. **No competition in the category.** General SEO tools exist. pSEO-specific compliance tools do not.
2. **Perfect timing.** March 2026 SpamBrain update is 3 weeks old. Every pSEO operator is scared. Ship now.
3. **Open-source flywheel.** Every `npx pseolint` run is a free impression for the hosted platform.
4. **Dogfood-first credibility.** Running on PaperForge (4,771 pages) proves it works at real scale.
5. **Your exact stack.** Next.js, Supabase, Drizzle, Better Auth, Polar, Coolify. Zero new learning.
6. **Compounds with portfolio.** Every pSEO project you build (PaperForge, Tallyard, future sites) is both a customer and a case study.
7. **Build-once maintenance.** Rules don't change often. Google's spam policies evolve slowly. The CLI is mostly stable after v1; the SaaS grows incrementally.
8. **Portfolio asset.** Fully open-source under `ouranos-labs`: visible, reviewable code with real algorithms (SimHash, TF-IDF, entity masking), monorepo architecture, CI/CD, and a production SaaS. Strong signal for job applications without polluting the personal `ouranos27` handle.
9. **Community extensibility.** MIT-licensed core with an extensible rule API means the community can contribute rules via PR. The rule set grows beyond 30 without you maintaining every addition.
10. **AGPL moat.** Web app under AGPL-3.0 prevents competitors from hosting a clone without open-sourcing their changes. The hosted service at pseolint.dev remains the path of least resistance.

---

## Quickstart: Scaffold the Monorepo

```bash
# Create the repo
mkdir pseolint && cd pseolint
git init
gh repo create ouranos-labs/pseolint --public --source=. --remote=origin

# Initialize monorepo
pnpm init
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'packages/*'
  - 'apps/*'
EOF

# Install workspace tooling
pnpm add -Dw turbo typescript vitest @changesets/cli

# Create turbo config
cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["build"] },
    "lint": {}
  }
}
EOF

# Scaffold packages
mkdir -p packages/core/src/{rules/{spam,content,links,tech,schema,cannibal},algorithms,formatters}
mkdir -p packages/cli/src
mkdir -p packages/action/src
mkdir -p apps/web/src

# Initialize each package
cd packages/core && pnpm init && cd ../..
cd packages/cli && pnpm init && cd ../..
cd packages/action && pnpm init && cd ../..
cd apps/web && pnpm init && cd ../..

# Add licenses
echo "MIT License..." > LICENSE
echo "MIT License..." > packages/core/LICENSE
echo "MIT License..." > packages/cli/LICENSE
echo "MIT License..." > packages/action/LICENSE
echo "AGPL-3.0..." > apps/web/LICENSE

# Initialize changesets
pnpm changeset init

# First commit
git add -A
git commit -m "chore: scaffold pseolint monorepo"
git push -u origin main
```

**Then paste this entire brief into Claude Code and say:**

> "Read this brief. Start with Session 1: build the SimHash algorithm, entity masking, and HTML parser in packages/core. Include tests with vitest. Use the project structure defined in the brief."

---

## Quick Reference Card

```
Repo:       github.com/ouranos-labs/pseolint
Domain:     pseolint.dev ($13/yr) + pseolint.com ($11.25/yr redirect)
npm:        pseolint (CLI) + @pseolint/core (engine)
License:    MIT (packages/*) + AGPL-3.0 (apps/web)
Stack:      TypeScript, pnpm, Turborepo, Changesets
CLI stack:  Commander, Cheerio, Chalk, Zod, Cosmiconfig
Web stack:  Next.js 15, Supabase, Drizzle, Better Auth, Polar.sh,
            Trigger.dev, Upstash, Resend, OpenRouter, Coolify
Pricing:    Free (CLI) / $14 Pro / $24 Team via Polar.sh
Timeline:   10 weeks (CLI week 4, platform week 8, ecosystem week 10)
```
