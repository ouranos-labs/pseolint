# Seven Sweeps copy validation — pseolint.dev marketing pages

**Date:** 2026-05-08
**Scope:** v0.6.3–v0.6.4 marketing-copy refresh validation
**Pages reviewed:** 8 (7 marketing routes + `template-breakdown-hero.tsx`)
**Method:** Seven Sweeps (clarity, voice/tone, so what, prove it, specificity, hedging, redundancy, headline-paragraph alignment) applied per page

---

## Executive summary

The v0.6 vocabulary refresh is **substantively coherent** across the corpus. "Audits by template, not URLs" is the through-line on every page; "K=10 per template", "siteVerdictFromTemplates", and "≥5% URL coverage" appear consistently and in identical form. Brand voice (technical, specific, comfortably hedged) holds across all 8 surfaces.

**Real issues are local, not structural.** The biggest concrete problems: (1) the landing page hero subhead runs ~75 words and re-states "AI Overview readiness" twice in one paragraph; (2) `tools/page.tsx` repeats the "scares people who already suspect what's wrong" sentence verbatim in two places; (3) `limits/page.tsx` has the same "every undocumented quota becomes a support ticket" point in both the lede paragraph AND the FAQ JSON-LD; (4) the `tools/page.tsx` "Implementation footnote" paragraph ("Jaccard coefficient over noun-trigram shingles per template cohort, then dampens recall via Levenshtein-bounded cluster merging") reads as ornamental jargon rather than informative — flagged below; (5) the User-Agent string on `limits/page.tsx` is inconsistent (`pseolint/0.4.0` in the FAQ, `pseolint/0.2.2` in the table) — the FAQ value is right; the table value is stale.

Voice is on-brand throughout. No marketing inflation, no manufactured superlatives, hedging is earned ("we infer plausible SpamBrain signals", "the score is a heuristic"). The pricing page, methodology page, and TemplateBreakdownHero are the strongest. The landing-page lede and the tools-page footnote are the weakest.

---

## 1. Per-page sweep results

Counts are issues found per sweep. Severity is implicit in the example quotes (worst flagged first).

### 1.1 `apps/web/src/app/page.tsx` — landing

| Sweep | Issues | Examples |
|---|---|---|
| Voice consistency | 0 | On-brand throughout. Opening "Most programmatic SEO is doorway-page gardening" is opinionated and earns it. |
| Clarity | 2 | Hero subhead is 5 sentences, ~75 words, three nested parentheticals. "Not a general SEO audit — see scope below" gets buried. Also the "By the numbers" first stat row crams 8 version events into one bullet — needs re-reading. |
| Specificity | 0 | Strongest page on this dimension. "$19/month", "K=10 per template", "March 27, 2026 core update", "May 7, 2024 site-reputation-abuse policy", "50 MB bandwidth cap", "5 parallel fetches", "2 minutes" Crawl-delay cap — earned every claim. |
| Hedging | 0 | Hedging is appropriate: "score isn't a guarantee", "make no claim of one-to-one correspondence" stays on the methodology and limits pages where it belongs. |
| Redundancy | 2 | "AI Overview readiness" + "Answer Engine Optimization (how citable your pages are to ChatGPT, Perplexity, and Google AI Overviews)" in the same paragraph repeats the same idea. The "Field report" intro and the receipt cards both explain "lower score = safer" implicitly. |
| Sentence flow | 1 | The hero p tag (`<p className="text-base...">`) at line 182–188 is one 75-word sentence-cluster with three em-dash branches. Could split. |
| H1 + first paragraph alignment | 0 | H1 promises "v0.6 audits your templates, not just URLs" → opening paragraph delivers ("see which templates are broken and which are clean"). Honest alignment. |

**Example quotes:**
- *"An audit specifically for programmatic-SEO sites (template-driven content at scale) and AI Overview readiness. Paste your site. In 60 seconds, see which templates are broken and which are clean — site-type-aware scoring across SpamBrain classifier triggers and Answer Engine Optimization (how citable your pages are to ChatGPT, Perplexity, and Google AI Overviews). Not a general SEO audit — see scope below."* — three things in one paragraph (what it is, what it does, what it isn't). Each could be its own sentence.
- *"Template-aware SpamBrain + AEO scoring (v0.6) — v0.6 pivots the unit of analysis from URL to template. K=10 URLs sampled per template..."* — version label "v0.6" appears twice in a 25-word span.

### 1.2 `apps/web/src/app/methodology/page.tsx` — methodology

| Sweep | Issues | Examples |
|---|---|---|
| Voice consistency | 0 | The strongest page on voice. "Read this as engineering reference. Not a testimonial page." sets and keeps the tone. |
| Clarity | 1 | The "Snapshot results" paragraph "Three sites score worse than their ceiling..." is fine, but the bring-your-own-DA paragraph that follows nests two parentheticals and an em-dash and tries to do four things at once. |
| Specificity | 0 | "33% → 78%", "276-line doorway noise", "9 calibration rounds", "v0.5.2 changelog", every site row has a documented risk score. Excellent. |
| Hedging | 0 | All hedging is earned ("point-in-time", "subject to drift", "the engine is a static-content + link-graph analyzer"). |
| Redundancy | 1 | "Calibration laundering" is defined twice — once in the SKIPPED_SITES JSDoc-y comment ("we did NOT update ceilings") and once in the "We did NOT update the ceiling on these sites to force a pass. That would be calibration laundering" paragraph. The second one is the right placement; the JSDoc could shorten. |
| Sentence flow | 0 | Excellent rhythm. Long sentences are deliberately structured (e.g. the four-clause bring-your-own-authority sentence) and the short engineering-style headers reset cadence. |
| H1 + first paragraph alignment | 0 | "How pseolint's verdicts are calibrated." → first paragraph defines predictive vs face validity → page delivers exactly that. |

**Example quotes:**
- *"Most SEO audit tools rely on face validity — 'these rules look like they map to documented Google policy.' pseolint adds *predictive* validity..."* — opening punches, sets the page's frame instantly. Strong.
- *"Pass `--authority-score 80` when auditing these sites and the verdict shifts one tier lenient (concerning → caution; critical → concerning) — that's the bring-your-own-DA mechanism documented under *Limitations* above."* — slightly long but every word is load-bearing. Acceptable.

### 1.3 `apps/web/src/app/limits/page.tsx` — limits + FAQ

| Sweep | Issues | Examples |
|---|---|---|
| Voice consistency | 0 | "Written plainly. No dark patterns, no asterisks hiding behind footnotes" sets the tone and the page delivers. |
| Clarity | 1 | The hero paragraph is 12 lines / ~150 words and tries to be both pricing summary and tier comparison. Heavy. |
| Specificity | 0 | "$259/year (Screaming Frog)", "$35/month (Sitebulb)", "50 MB", "30 fetches per hour per host", "Retry-After capped at 30 seconds" — all earned. |
| Hedging | 0 | Earned ("Sampling is lossy", "Score is a heuristic"). |
| Redundancy | 3 | (a) "Why publish concrete limits at all?" appears verbatim in the lede paragraph (line 78–84) AND as the first FAQ (line 24–25) — same phrasing, same paragraph beats. The FAQ exists for JSON-LD; the prose version is redundant. (b) The SpamBrain-March-2024 / site-reputation-May-2024 / AEO list appears in the hero paragraph, in the "Audit focus" Item, and indirectly in the "What pseolint doesn't audit" section. (c) "Out of scope" is repeated 5 times in 6 bullets in "What pseolint doesn't audit". |
| Sentence flow | 0 | After the long lede, the rest is dense but well-structured Item rows. Each Item is one fact. |
| H1 + first paragraph alignment | 0 | "What a free audit does, and doesn't" → first paragraph delivers exactly that, with the cost cap and tier deltas spelled out. |

**Example quotes:**
- *"Free tier: $0, up to 200 pages per audit (50 without an account) — v0.6 samples K=10 URLs per detected template up to the page budget, 24-hour anonymous retention (30-day window for signed-in accounts), 3 audits per day per browser session. Pro tier: $19/month..."* — the lede attempts to be a full pricing card. Could collapse to "Free: 200 pages, 24h retention. Pro: $19/mo." and let the table below do the rest.
- **Inconsistency, not redundancy** — `User-Agent` Item row says `pseolint/0.2.2`, FAQ answer says `pseolint/0.4.0`. The FAQ value is current (matches @pseolint/core 0.6.0 cycle); the Item row is stale.

### 1.4 `apps/web/src/app/tools/page.tsx` — tools comparison

| Sweep | Issues | Examples |
|---|---|---|
| Voice consistency | 1 | The "Implementation footnote" paragraph drifts into ornamental-jargon territory ("Jaccard coefficient over noun-trigram shingles per template cohort, then dampens recall via Levenshtein-bounded cluster merging") — feels added to look smart, doesn't help the reader. Other technical detail on the page is precise; this one isn't. |
| Clarity | 1 | The "How rules feed into per-template verdicts" section list has 4 bullets each starting with bolded labels ("Per-page → template uniformity score", etc.). The labels are useful; the labels-with-arrows pattern is dense and slows reading. |
| Specificity | 0 | "$129/month (Ahrefs Lite)", "$139.95/month (Semrush Pro)", "$44/month (ContentKing Basic)" — table is excellent. |
| Hedging | 0 | "The honest read: pseolint is not a replacement for Ahrefs or Semrush..." is a great earned hedge. Stays. |
| Redundancy | 2 | (a) "A single 'run-the-full-audit' CTA scares people who already suspect what's wrong. The SpamBrain checker is for operators who watched..." appears verbatim in the FAQ (line 44) AND the body prose (line 244). Pick one. (b) "spam/* covers the patterns that triggered the March 5, 2024 scaled-content-abuse update — thin content under 300 words, doorway clusters..." appears in the FAQ (line 40) and again in the body prose around line 233. |
| Sentence flow | 1 | The closing footnote paragraph (the Jaccard one) reads as one 50-word sentence with three technical concepts that don't compound. |
| H1 + first paragraph alignment | 0 | "Free SEO tools" → first paragraph delivers "$0, no signup, runs in a 60-second median". Honest. |

**Example quotes:**
- *"Implementation footnote: the entity-swap detector applies a Jaccard coefficient over noun-trigram shingles per template cohort, then dampens recall via Levenshtein-bounded cluster merging — orthogonal to the SimHash fingerprint described above. Both signals feed the consolidated cannibalization-versus-doorway disambiguation classifier documented under the spam/* taxonomy."* — three technical terms strung together without explaining why a reader on this page would care. Either delete or anchor to a documented behaviour.
- *"A single 'run-the-full-audit' CTA scares people who already suspect what's wrong"* — appears in two places. Worth picking one.

### 1.5 `apps/web/src/app/rules/page.tsx` — rules taxonomy

| Sweep | Issues | Examples |
|---|---|---|
| Voice consistency | 0 | On-brand. |
| Clarity | 1 | The long "How the rules map to SpamBrain" paragraph is one 100-word sentence listing every rule category with parenthetical counts. Hard to scan. |
| Specificity | 0 | "32 rules across 8 categories — 8 spam/*, 8 aeo/*, 6 links/*, 4 tech/*, 4 content/*, 3 schema/*, 2 data/*, 1 cannibal/*". Strong. |
| Hedging | 0 | Earned. |
| Redundancy | 2 | (a) The "What makes a rule AEO-aligned" body paragraph is a near-verbatim restatement of FAQ #2 — same phrasing about "2022 SpamBrain rebuild changed enforcement". (b) The closing "Provenance footnote" feels added on (similar shape to the tools-page footnote — see voice flag below). |
| Sentence flow | 1 | The "Spam/* (8 rules) covers the patterns the March 27, 2026 core update demotes most aggressively..." sentence chains seven clauses with em-dashes and parentheticals. Could be split into 2–3. |
| H1 + first paragraph alignment | 0 | "SpamBrain rules — what pseolint detects" → first paragraph immediately delivers the rule-by-category breakdown. |

**Example quotes:**
- *"Spam/* (8 rules) covers the patterns the March 27, 2026 core update demotes most aggressively — the most recent classifier shift to hit pSEO, tightening scaled-content signals on date-stacked corpora — building on the March 5, 2024 scaled-content-abuse update that first targeted thin content under 300 words, doorway clusters with shared boilerplate, near-duplicate templates with >85% lexical overlap, templates that don't vary their structural skeleton, and corpus-aware publication-velocity..."* — one sentence, ~80 words, six commas and two em-dashes. Worth splitting.
- *"Provenance footnote: ruleId namespaces are stable contract from v0.4 forward..."* — feels added for completeness, not for the reader. Same pattern as the tools-page footnote.

### 1.6 `apps/web/src/app/symptoms/page.tsx` — symptoms

| Sweep | Issues | Examples |
|---|---|---|
| Voice consistency | 0 | Strong. The "Triage philosophy here borrows from incident-response runbooks" paragraph is on-brand and earns its abstraction. |
| Clarity | 0 | Page is structurally clean — symptom cards, then triage methodology, then recovery timelines. Each section does one thing. |
| Specificity | 0 | "30–90 days median observed recovery", "1–2 weeks for manual actions", "$259/year (Screaming Frog)". |
| Hedging | 0 | Hedging is earned ("median observed", "broadly true for top-of-funnel content"). |
| Redundancy | 1 | The "How to triage a SpamBrain hit" body paragraph and FAQ #1 are the same content with slight reorderings. Same triage shape, same examples (impressions cliff, CTR collapse, indexed-but-not-served). |
| Sentence flow | 0 | Comfortable cadence. The "branching diagnostic flows rather than 'ultimate guides'" line lands. |
| H1 + first paragraph alignment | 0 | "SpamBrain symptoms — diagnose your site" → first paragraph delivers "If your traffic chart looks wrong and you don't yet know why, start here." |

**Example quotes:**
- *"In v0.6, the audit tells you which template is responsible — not just which URLs."* — load-bearing single sentence. Strong.
- *"Skipping the triage step is the most common reason teams burn weeks on the wrong fix."* — earned, opinionated, on-brand.

### 1.7 `apps/web/src/app/pricing/pricing-client.tsx` — pricing

| Sweep | Issues | Examples |
|---|---|---|
| Voice consistency | 0 | Strongest voice on the corpus. "Audits stay free. Monitoring is the upgrade." commits and the page delivers. |
| Clarity | 0 | Clean. Plan cards → feature list → free tier → comparison table → "why we chose this pricing model" → FAQ. Each section does one thing. |
| Specificity | 0 | "$19/month / $180/year (2 months free, $48 saved)", "@pseolint/core 0.6.0", "K=10 vs K=20 sample depth", "14-day refund". |
| Hedging | 0 | Earned ("Pro is single-seat today", "Multi-seat... on the roadmap and will ship as a tier above Pro"). |
| Redundancy | 1 | "Both tiers run the same template-aware SpamBrain and AEO engine from @pseolint/core 0.6.0" appears in the comparison table intro, and the same point ("the same rule will flag it in the free CLI") appears in the "Why we chose this pricing model" section. Two phrasings of the same trust-building claim. Acceptable but could collapse. |
| Sentence flow | 0 | Mixed short/long well. "Pro is OSS-first by design" → 2-sentence punch → table. |
| H1 + first paragraph alignment | 0 | "Audits stay free. Monitoring is the upgrade." → first paragraph delivers exactly that promise, with the bargain spelled out. Best alignment in the corpus. |

**Example quote:**
- *"We deliberately did not gate any rule, severity, or scoring formula. If pseolint flags an issue in Pro, the same rule will flag it in the free CLI, and you can debug it offline."* — earns trust by committing to a falsifiable promise.

### 1.8 `apps/web/src/components/landing/template-breakdown-hero.tsx`

| Sweep | Issues | Examples |
|---|---|---|
| Voice consistency | 0 | On-brand. "Pinpoint which template is broken. Fix one template, fix N pages." is concise and committed. |
| Clarity | 0 | The before/after sampling-model footer is a clean A-vs-B explanation. |
| Specificity | 0 | "8,201 of 8,432 URLs", "97.3% of the site", "200 URLs vs 30 fetches". |
| Hedging | 0 | None needed; the component is a static example with hard numbers. |
| Redundancy | 0 | None — every paragraph contributes a distinct point. |
| Sentence flow | 0 | Short, punchy. Good. |
| H1 + first paragraph alignment | 0 | "v0.6 audits your site by template. Here's what that looks like." → grid + annotation directly delivers. |

**Example quote:**
- *"This is the site verdict. siteVerdictFromTemplates picks the worst template with ≥5% URL coverage. /listing/:slug covers 97.3% of the site — so its concerning verdict drives the headline, even though /article/:slug is clean. One template-level fix, not 8,201 page-by-page investigations."* — exemplary marketing copy: a numerical claim, a code identifier, and a closing punch line, all aligned to the page's promise.

---

## 2. Cross-page consistency check

The v0.6 vocabulary refresh **landed evenly**. No page got a less thorough update than another in terms of the new terminology.

| Term | landing | methodology | limits | tools | rules | symptoms | pricing | TBHero |
|---|---|---|---|---|---|---|---|---|
| "audits by template, not by URL" (or close variant) | yes | yes | yes | yes | yes | yes | yes | yes |
| `K=10 per template` | yes | yes | yes | yes | yes | yes | yes | yes |
| `siteVerdictFromTemplates` | (mentioned in stats list) | yes | (referenced) | yes | yes | (referenced) | yes | yes |
| `≥5% URL coverage` | yes | yes | yes | yes | yes | yes | yes | yes |
| `uniformityScore` | no | yes | no | yes | yes | (mentioned) | (referenced) | yes |
| March 27, 2026 core update | yes | no | no | yes | yes | no | no | no |
| May 7, 2024 site-reputation-abuse | yes | no | yes | yes | yes | yes | no | no |
| `@pseolint/core 0.6.0` version pin | no | no | no | yes | no | no | yes | no |

**Observations:**

1. **`uniformityScore` is the most under-used term**. It's load-bearing on the methodology page and the TemplateBreakdownHero, but the symptoms page mentions it in the body without naming the metric, and the limits/landing pages don't surface it. Not a problem — it's an internal metric — but worth knowing if you ever want to make uniformity a marketing concept.

2. **Date-stamped policy events skew toward landing/rules/tools**. The methodology, pricing, symptoms, and limits pages don't all cite the dates. This is correct: methodology is about engine validation (different scope), pricing is about commercial terms, symptoms is bottom-funnel triage. The dates belong where they belong.

3. **The version pin (`@pseolint/core 0.6.0`)** appears only on tools and pricing. That's correct — those are the two pages where the version is load-bearing for OSS callers / paying users.

4. **No drift between pages on the same fact.** Where a page references "K=10 per template", it's K=10 everywhere (not K=12 on one page and K=10 on another). Where ≥5% coverage is named, it's 5% everywhere. Where median audit time is stated, it's "60 seconds" or "1 minute" — those are interchangeable but consistent.

5. **One actual inconsistency:** the `pseolint/0.2.2` User-Agent string in `limits/page.tsx` line 138 disagrees with the `pseolint/0.4.0` User-Agent string in the FAQ on the same page (line 29). The FAQ has the right value. Worth fixing.

---

## 3. The 5 most important fixes

Ranked by impact on reader trust.

### Fix 1 — `limits/page.tsx`: the User-Agent inconsistency
**Why it matters most.** A page whose entire premise is "written plainly, no surprises, this is the source of truth for how aggressive our crawler is allowed to be" loses credibility instantly when two adjacent statements about the User-Agent disagree on the version number. Engineers checking server logs will grep for the literal string.
**Edit:** change line 138 from `pseolint/0.2.2` to `pseolint/0.4.3` (the current CLI version). Or use the major/minor `pseolint/0.4` if you prefer a semver-stable spec.

### Fix 2 — `tools/page.tsx`: delete the "Implementation footnote" paragraph
**Why.** The Jaccard / Levenshtein / SimHash footnote is the single passage in the corpus that fails the "jargon used precisely vs jargon used to sound smart" test. Every other technical mention on the page is anchored to a behavior the reader can verify (`spam/near-duplicate`, K=10, `siteVerdictFromTemplates`). This one isn't — it's three buzzwords for one sentence with no observable consequence for the user.
**Edit:** delete the paragraph at lines 365–372. The CTA paragraph above it is sufficient.

### Fix 3 — `tools/page.tsx`: collapse the FAQ-vs-body redundancy
**Why.** The "scares people who already suspect what's wrong" sentence is the page's most quotable line. Saying it twice (FAQ + body prose) deflates it and tells the reader the writer didn't notice. Same with the SpamBrain rule list (FAQ + body).
**Edit:** Keep the FAQ version (so it shows in JSON-LD answer-engine snippets). Replace the body-prose duplicate at line 243–250 with a one-liner that cross-links to the FAQ or to `/symptoms`.

### Fix 4 — `page.tsx` landing hero: split the 75-word subhead
**Why.** The lede is the 80% of the work that determines whether a visitor passes the 3-second test. Right now the subhead is doing four jobs: (a) what pseolint is, (b) what AEO means, (c) how it works, (d) what it isn't. Splitting reads faster without losing any claim.
**Edit (suggested split, not prescriptive):**
> An audit specifically for programmatic-SEO sites (template-driven content at scale).
>
> Paste your site. In 60 seconds, see which templates are broken and which are clean — site-type-aware scoring across SpamBrain triggers and AEO (Answer Engine Optimization — how citable your pages are to ChatGPT, Perplexity, and Google AI Overviews).
>
> Not a general SEO audit — see scope below.

### Fix 5 — `limits/page.tsx`: collapse the "Why publish concrete limits" duplication
**Why.** The point lives in the lede AND the FAQ JSON-LD. Both are valuable in their respective contexts (visible prose vs structured data), but the verbatim repetition is visible to a human reader scrolling top-to-bottom.
**Edit:** Keep the FAQ verbatim (it's compiled into JSON-LD). Replace the duplicate prose paragraph at lines 78–84 with a tighter version, or move it inside one of the Section blocks below.

---

## 4. What's already strong

These observations are honest, not manufactured.

1. **Voice consistency is exceptional for an 8-page corpus**. Every page reads like the same author wrote it: technical, opinionated, comfortable hedging where earned, no marketing inflation. This is rare in SaaS marketing copy and is the most valuable property of the v0.6 refresh.

2. **Specificity is the strongest dimension across all 8 pages**. Numbers everywhere — `$19/month`, `K=10 per template`, `March 27, 2026 core update`, `50 MB bandwidth cap`, `30 fetches per hour per host`, `14-day refund`. The brand-voice baseline ("32 rules" not "comprehensive ruleset") holds without exception.

3. **The pricing page is exemplary copy**. "Audits stay free. Monitoring is the upgrade." commits to a clear positioning in 7 words. The FAQ is structured around the actual objections (cancel, refund, self-host, BYO key, team plans) and the "Why we chose this pricing model" section earns trust by explaining the OSS / hosted boundary in concrete terms ("we deliberately did not gate any rule").

4. **The methodology page is the strongest engineering-credibility surface in the corpus**. "Read this as engineering reference. Not a testimonial page." sets the frame and the page delivers — auditable corpus, named runner script, documented trade-offs ("calibration laundering" as a coined term), explicit blind-spots inventory. The "These sites have not endorsed pseolint" disclosure is the kind of move that earns trust precisely because most marketing sites would never publish it.

5. **The TemplateBreakdownHero is the cleanest single artifact** — three template cards, one annotation callout, one before/after sampling-model footer. Every paragraph contributes a distinct point. No redundancy, no padding, no jargon for jargon's sake.

6. **The v0.6 vocabulary is internally consistent**. "K=10 per template" means the same thing on every page; `siteVerdictFromTemplates` is referenced (not paraphrased) wherever it appears; ≥5% URL coverage is the threshold everywhere. This kind of vocabulary discipline across 8 pages refreshed in two patch versions (v0.6.3–v0.6.4) is the actual measure of how well the refresh landed.

7. **Hedging is earned, not defensive**. "We infer plausible SpamBrain signals from public documentation, research, and observed patterns. We do not have access to Google's actual classifier and make no claim of one-to-one correspondence." This is exactly the right paragraph to have on the limits page — it preempts the most common skeptic objection without retreating from the engine's claims.

8. **No page reads like AI-generated marketing copy**. No "revolutionize your workflow", no "powerful audit suite", no "comprehensive solution". The opinionated framing ("Most programmatic SEO is doorway-page gardening", "audits by template, not by URL") is on-brand and load-bearing.

---

## Verdict

The v0.6.3–v0.6.4 marketing refresh is **structurally sound**. The five fixes above are local edits that take an hour total. None of the pages need a structural rewrite. The brand voice baseline holds, the new vocabulary is consistent across all 8 surfaces, and the specificity discipline (numbers, dates, version pins) is exceptional.

If only one thing is fixed, fix the User-Agent string inconsistency on `limits/page.tsx` — the page's premise is "no surprises, this is the source of truth", and a stale string adjacent to a current one undercuts that premise instantly.
