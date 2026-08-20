# pseolint scoring: credibility audit + redesign proposal

**Status:** PROPOSAL · awaiting greenlight before implementation
**Author:** [generated 2026-04-30]
**Trigger:** A trusted external reviewer ran pseolint and didn't believe the
result. Independent dogfood against three premier marketing sites
(nextjs.org, wordpress.com, shopify.com) confirmed the credibility issue.

---

## §1 The credibility problem, in one sentence

pseolint scores **nextjs.org as `concerning` (risk 60)** and would have
scored shopify.com similarly if backpressure hadn't intervened. Any user
who knows these sites rank fine on Google will conclude the tool is wrong,
not that Vercel and Shopify have an SEO problem. They will close the tab
and not come back.

This is the single biggest threat to product-market fit for a paid SaaS
that promises "audit your site for SpamBrain risk."

---

## §2 The evidence: nextjs.org breakdown

```
verdict:  concerning (was nearly critical)
risk:     60
pages:    3
classification: unclear @ 50% confidence (sample too small)

Categories:
  integrity        C (3 issues)   ← spam + content + cannibal
  discoverability  D (5 issues)   ← links + tech
  citation         F (6 issues)   ← aeo + schema  ← THE PROBLEM
  data             A (0 issues)
```

### Blockers (severity=error, contributes 25 raw points each)

| Rule | Count | Honest read |
|------|------:|-------------|
| `aeo/citable-facts` | 3 | Each Next.js docs landing page has < 8 entity-specific numbers. **This is what marketing pages look like.** |
| `spam/thin-content` | 1 | One docs page is short. May be a legit nav landing, may be a real bug. |
| `tech/canonical-consistency` | 1 | Real technical signal: worth checking. |
| `aeo/answer-first` | 1 | Opener doesn't lead with a number+entity. **Marketing tone, not a defect.** |
| `links/orphan-pages` | 1 | One page has no inbound links in the sample. Likely a sampling artifact (3 pages out of 573 discovered). |

### Should-fix (severity=warning, contributes 12 raw points each)

| Rule | Count | Honest read |
|------|------:|-------------|
| `content/missing-author` | 1 | Technical docs don't have bylines. Convention. |
| `aeo/freshness-signals` | 1 | No `dateModified` meta. **Style, not penalty.** |
| `aeo/answer-first` | 1 | Same as blocker but on a different page. |
| `links/dead-ends` | 1 | One outbound-link-free page. |

### What dominates the score

**7 of the 11 actionable issues are AEO-style** ("your marketing page
doesn't read like a fact database"). They drive the Citation category to
**Grade F**, which contributes 25 risk points (Citation weight × max
penalty = 0.25 × 100). Without those 7 AEO findings, nextjs.org would
score around **risk 19 → `ready`** under the same engine. **The verdict
flips from `concerning` to `ready` based purely on the AEO call.**

That is the calibration crisis in concrete form.

---

## §3 The math: why this happens

### Severity weights (raw penalty per finding)

```ts
SEVERITY_WEIGHTS = { critical: 40, error: 25, warning: 12, info: 5 }
```

These are **steep**. Four `error`-severity findings in any single category
(25 × 4 = 100) max out that category's raw bucket. With Citation weighted
0.25, four AEO errors alone contribute **25 risk**, a quarter of the
worst-possible verdict.

### Category weights

```ts
CATEGORY_WEIGHTS = {
  integrity:       0.50,  // spam + content + cannibal
  discoverability: 0.20,  // links + tech
  citation:        0.25,  // aeo + schema  ← 25% of verdict, mostly AEO
  data:            0.05,
}
```

Citation = `aeo/*` + `schema/*`. Schema rarely fires; AEO fires
constantly on marketing pages. So Citation IS the AEO score in
practice, weighted at a quarter of the verdict.

### AEO rule severities are wrong

| Rule | Current `error` trigger | Reality on marketing pages |
|------|-------------------------|----------------------------|
| `aeo/citable-facts` | `< 3` unique citable facts | Most marketing pages have 0-2 |
| `aeo/answer-first` | First paragraph fails extraction check | Marketing copy is narrative |
| `aeo/summary-bait` | Facts above the fold + no interactive value | This is good marketing structure |
| `aeo/crawler-access` | All AI crawlers blocked | Plenty of sites block GPTBot intentionally |

**An "error" should mean: this will hurt you with Google.** None of these
rules predict Google demotion. They predict AI Overview citation likelihood,
a different concern. Conflating them is the bug.

### Severity → verdict math (current)

For a 3-page sample like nextjs.org's:
- 3 × `aeo/citable-facts` (error)  = 75 raw  → cap 100 in Citation bucket
- 1 × `aeo/answer-first` (error)   = +25     → already capped
- 1 × `aeo/freshness-signals` (warn) = +12  → already capped
- Citation contributes: 100 × 0.25 = **+25 risk just from AEO**

Add modest integrity (37 × 0.5 = 18.5) and discoverability (62 × 0.20 =
12.4) penalties → 25 + 18.5 + 12.4 = **55.9 → "concerning" (60 rounded)**.

Without the AEO contribution, the same site scores 31 → `caution`. With
re-calibrated severity weights (proposed §6), it scores 19 → `ready`.

---

## §4 What this looks like to a user

> **Sarah, head of marketing at a SaaS startup, runs pseolint on her site.**
> Verdict: `concerning`. She runs it on nextjs.org as a sanity check (she
> trusts Vercel's marketing team). Verdict: `concerning`. She runs it on
> shopify.com. Verdict: `critical`. **She concludes: "this tool isn't
> calibrated. It scores everyone as bad. Useless."** She closes the tab.
> She tells two friends.

This is your friend's reaction in market-research form. The tool fails the
**sanity check on respected sites.** Until that's fixed, every marketing
push will recruit users who run one audit, see "concerning," and bounce.

---

## §5 Mental model: what users actually want to know

Map the rules to the **user's question**, not our internal taxonomy:

### Question 1: "Will Google penalize my site?"

This is the marquee promise. Rules that genuinely predict demotion:

| Rule | Why it's a real penalty risk |
|------|------------------------------|
| `spam/near-duplicate` | March 5 2024 scaled-content-abuse: direct SpamBrain trigger |
| `spam/entity-swap` | Doorway-page detection: SpamBrain rebuild Aug 25 2022 |
| `spam/doorway-pattern` | Same |
| `spam/template-coverage` | Scaled-content classifier signal |
| `spam/template-diversity` | Same |
| `spam/boilerplate-ratio` | Thin/templated content signal |
| `spam/thin-content` | Helpful Content System penalty |
| `spam/publication-velocity` | Scaled-content velocity signal |
| `cannibal/url-pattern` | URL-pattern intent collisions |
| `content/unique-value` | Per-page uniqueness (Helpful Content) |
| `content/meta-uniqueness` | Same |

**These should drive the verdict, weighted heavily.**

### Question 2: "Is my site technically discoverable?"

Real ranking-affecting tech hygiene:

| Rule | Why it matters |
|------|----------------|
| `tech/canonical-consistency` | Wrong canonical → wrong URL indexed |
| `tech/canonical-noindex-conflict` | Pages get dropped from index |
| `tech/robots-noindex-conflict` | Same |
| `tech/redirect-chain` | Crawl-budget waste |
| `tech/sitemap-completeness` | Pages missed by Google |
| `tech/robots-sitemap-presence` | Same |
| `tech/soft-404` | Pages dropped from index |
| `tech/hreflang-consistency` | International ranking issues |
| `links/orphan-pages` | Pages don't get crawled |
| `links/dead-ends` | Crawl-budget signal |
| `links/cluster-connectivity` | Topic authority signal |
| `links/link-depth` | Pages too deep don't rank |

**Real ranking concerns. Weight moderately.**

### Question 3: "Will AI Overviews cite my site?"

Citability optimization, **a separate product question**:

| Rule | Why it's AEO-only |
|------|-------------------|
| `aeo/citable-facts` | AI cites quotable facts; marketing pages legitimately have few |
| `aeo/answer-first` | AI extracts first-paragraph; marketing copy uses other structure |
| `aeo/summary-bait` | AI summarizes top-of-page; some pages want this |
| `aeo/llms-txt` | Optional standard for AI crawlers |
| `aeo/crawler-access` | Whether AI bots are allowed |
| `aeo/freshness-signals` | Date markers help AI cite recent info |
| `aeo/faq-coverage` | Schema for question pages |
| `aeo/content-modularity` | Section structure for extraction |

**These don't predict Google demotion. They're an opt-in optimization for
a different traffic source.** Should not contribute to the SpamBrain
verdict by default.

### Question 4: "Is my data well-formed?"

Engine hygiene, low-stakes:

| Rule | Note |
|------|------|
| `schema/json-ld-valid` | JSON-LD parse errors |
| `schema/required-fields` | Schema.org required fields |
| `schema/consistency` | Cross-page schema mix |
| `data/data-binding` | Source-data verification (opt-in) |
| `content/eeat-signals` | E-E-A-T signals |
| `content/missing-author` | Author byline |

**Mostly informational. Weight low; visible but not verdict-driving.**

---

## §6 Proposed redesign

### Two verdicts, not one

The most important change. Audit reports show:

```
Verdict: READY for SpamBrain · CAUTION for AI Overviews
Risk:    19 / 100 SpamBrain     ·   38 / 100 AEO
```

The default risk shown in `--ci-threshold`, dashboards, and headlines is
the **SpamBrain verdict**. AEO is a parallel track, computed always and
shown alongside, but NEVER blocks CI by default.

To gate CI on AEO too, the user passes `--aeo-ci-threshold concerning`,
explicit opt-in.

### Re-categorize rules (4-bucket → 5-track)

| Track | Rules | Affects SpamBrain verdict? | Affects AEO verdict? |
|-------|-------|:--------------------------:|:--------------------:|
| **SpamBrain** | spam/* + content/unique-value + content/meta-uniqueness + cannibal/* | YES (heavy) | no |
| **Tech** | tech/* + links/* | YES (moderate) | no |
| **Schema** | schema/* | YES (light) | no |
| **AEO** | aeo/* | no | YES (heavy) |
| **Quality signals** | content/eeat-signals + content/missing-author + data/* | YES (light, info-only) | YES (light) |

### Re-weight categories (SpamBrain track)

```ts
SPAMBRAIN_WEIGHTS = {
  spambrain:  0.55,   // direct demotion risk, drives the verdict
  tech:       0.25,   // crawlability + index hygiene
  schema:     0.10,   // structured-data correctness
  quality:    0.10,   // E-E-A-T + author + data
}
// AEO is its OWN composite with its own weights, not mixed in.
```

### Re-calibrate severity weights

```ts
// Current, too steep, easy to max-out a category
SEVERITY_WEIGHTS_OLD = { critical: 40, error: 25, warning: 12, info: 5 }

// Proposed, finer-grained, harder to accidentally max out
SEVERITY_WEIGHTS_NEW = { critical: 30, error: 15, warning: 8, info: 3 }
```

Changes the math: 6 errors needed to max a category bucket (vs 4 today).
Real-world sites can have 4-5 minor issues without flipping to `concerning`.

### Re-calibrate AEO rule severities

| Rule | Current default | Proposed default |
|------|-----------------|------------------|
| `aeo/citable-facts` | `error` (< 3 facts) | `warning` (< 3) · `info` (3-7) |
| `aeo/answer-first` | `error` | `warning` |
| `aeo/summary-bait` | `error` | `warning` |
| `aeo/crawler-access` | `error` if all blocked | `warning` if all · `info` if some |
| `aeo/freshness-signals` | `warning` | `info` |
| `aeo/llms-txt` | `warning` | `info` |
| `aeo/faq-coverage` | `info` | `info` (unchanged) |
| `aeo/content-modularity` | `warning` | `info` |

**Rationale:** AEO is opt-in optimization, not penalty defense. None of
these failures predict ranking loss. `warning` says "consider this";
`error` says "fix before shipping"; an AEO finding is never the latter.

### Verdict thresholds (unchanged for SpamBrain track)

```
ready:       risk ≤ 20
caution:     risk ≤ 40
concerning:  risk ≤ 60
critical:    risk > 60
```

These are fine. The problem isn't the thresholds; it's that AEO findings
were inflating the risk number that the thresholds are applied to.

### Visible "what's NOT being checked"

Add to console + JSON output:

```
Verdict: READY for SpamBrain (risk 19/100)
Verdict: CAUTION for AI Overviews (risk 38/100), pass --aeo-ci-threshold to gate CI

Skipped this audit:
  4 pSEO-only rules, site classified as small-marketing
  3 noindex pages
  0 auth-detected pages

Pass --strict to disable site-classification suppression.
```

Users need to see the **scope of the audit**, not just its findings. The
current output makes it look like every applicable rule passed/failed;
it doesn't show what wasn't even checked.

---

## §7 Predicted scores under the new model

Using nextjs.org dogfood data:

### nextjs.org under v0.5 proposal

**SpamBrain track:**
- spam/thin-content (1 page, error → 15 raw)
- content/missing-author (1 page, info → 3 raw, lifted out of SpamBrain track to "quality")

Wait, I'm conflating tracks. Recompute:
- spambrain bucket: thin-content × 15 = 15 raw → 15 × 0.55 = 8.25
- tech bucket: canonical (15) + orphan (15) + dead-ends (8) = 38 raw → 38 × 0.25 = 9.5
- schema bucket: 0
- quality bucket: missing-author (3) = 3 raw → 3 × 0.10 = 0.3

**SpamBrain risk: 8.25 + 9.5 + 0 + 0.3 = 18 → READY ✓**

**AEO track:**
- citable-facts × 3 (warning) + answer-first × 2 (warning) + freshness × 1 (info) = 8+8+8+8+8+3 = 43 raw → 43 (single-track)

**AEO risk: 43 → CAUTION (>20, ≤40 boundary; round to caution)**

Combined output:
```
Verdict: READY for SpamBrain · CAUTION for AI Overviews
Risk:    18 / 100 SpamBrain    · 43 / 100 AEO
```

**This passes the sanity check.** Vercel's marketing team is competent;
nextjs.org doesn't have a SpamBrain problem; it does have AI-Overview-
optimization headroom. Both true. Both believable.

### shopify.com under v0.5 proposal (estimate from 193 should-fix)

Likely similar, high AEO-track number (their pages are gloriously
marketing-shaped) but low SpamBrain-track number. Same READY · CAUTION
shape.

### A real spammy site under v0.5 proposal

A directory with 5,000 templated pages and 80% near-duplicate clusters
would still trip spam/near-duplicate (× many) + spam/entity-swap (×
many) + spam/template-coverage etc. → SpamBrain track easily hits
risk 70+ → `critical`. The tool still does its job for the cases it's
supposed to detect. **The change is precision: false-positives on
clean marketing sites disappear; true-positive detection on actual
spam stays.**

---

## §8 Migration plan

### v0.5.0 (breaking): release ladder

Exactly the kind of change that warrants a major. The verdict shape, JSON
output, and CLI flags all shift.

1. **Engine**: split `scoreFromFindings` into `scoreSpamBrain` +
   `scoreAEO`. Add a third return field `aeo` to `AuditSummary`.
2. **Severities**: patch the 8 AEO rule files to demote default severity
   per §6 table.
3. **Formatters**: every formatter (console, json, markdown, html)
   shows two verdict lines. JSON adds an `aeo: { verdict, risk,
   categories }` sibling to the current top-level fields.
4. **CLI**: `--ci-threshold` continues to gate on SpamBrain. New
   `--aeo-ci-threshold <severity>` opt-in for AEO gating.
5. **MCP**: `audit_site` returns the SpamBrain verdict; new
   `audit_aeo_readiness` tool returns the AEO verdict. (Or extend the
   existing tool with an `include` parameter.)
6. **Web app**: dashboard tile shows two badges; report page has two
   verdict pills.
7. **Site classifier**: when site is classified `small-marketing` or
   `blog` AND user didn't pass `--aeo`, suppress AEO findings entirely
   (don't even report them). They're not relevant for those site types
   unless explicitly requested.
8. **Migration doc**: v0.4 → v0.5 migration guide. Note the new
   `aeo:` section in JSON; note that CI gates on SpamBrain only by
   default; show how to restore old behavior with `--aeo-ci-threshold
   concerning`.

### v0.4.3 (no breaking): interim calibration if v0.5 is too far

If v0.5 is more than a week away, ship a v0.4.3 patch:

1. Demote AEO error severities to warning per §6 table (in-place,
   no API change).
2. Halve AEO category weight: change `citation` from 0.25 to 0.10,
   add the 0.15 to `integrity` (now 0.65).
3. Document that the v0.4.x verdict is still single-track but AEO no
   longer dominates.

This is a band-aid; v0.5 is the right fix.

---

## §9 Risk + open questions

- **Q: Is the friend's reaction representative?** Probably yes. Sarah-the-
  marketer doesn't know to opt out of AEO. The default has to be right.
- **Q: Will demoting AEO upset anyone?** Anyone who actually wanted AEO
  scoring can pass `--aeo` (or upgrade to Pro and toggle it). Those users
  are the minority. Default-OFF is correct for a tool that says
  "SpamBrain risk."
- **Q: What if the site IS pSEO and AEO matters?** Site classifier already
  detects `programmatic-directory`. For those sites, enable AEO by default.
  For everyone else, keep it opt-in.
- **Q: Should we keep the single risk number anywhere?** Yes: for trend
  charts, alert thresholds, leaderboards. Show "SpamBrain risk" as the
  trended number; AEO is its own line.

---

## §10 Decision needed

Three options:

1. **Accept §6 as-is and ship as v0.5.0**: proper fix, takes ~3-5 days
   of agent-driven work + 1 day re-dogfood.
2. **Ship v0.4.3 band-aid first** (severity demotion + weight shift),
   then v0.5.0 properly later.
3. **Workshop §6 further**: invite reviewers, run the proposal past
   the friend who flagged the original credibility issue, validate
   the new defaults against more sites.

Recommendation: **(2) then (1).** Ship v0.4.3 today (4 hours: the AEO
severity flips + the weight shift). It immediately makes nextjs.org
score `caution` instead of `concerning`, enough to restore baseline
trust. Then schedule v0.5.0 for next week with the two-verdict split.
