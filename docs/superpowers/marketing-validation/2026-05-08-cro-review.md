# CRO Review — pseolint.dev landing + pricing
**Date:** 2026-05-08
**Reviewer:** CRO pass (landing-page-optimization + page-cro skills)
**Files evaluated:**
- `apps/web/src/app/page.tsx` (landing)
- `apps/web/src/components/landing/template-breakdown-hero.tsx` (v0.6.3 visual centerpiece)
- `apps/web/src/app/pricing/page.tsx` (wrapper)
- `apps/web/src/app/pricing/pricing-client.tsx` (pricing detail)

Audience target: technical operators of programmatic-SEO sites.
Voice mandate: concise, technical, opinionated; specific numbers preserved; no SaaS-marketing inflation.

---

## 1. 5-second test

**What I understood from the hero in 5 seconds, reading top-down on desktop:**

> Most programmatic SEO is doorway-page gardening. v0.6 audits your templates, not just URLs.

Followed by a paste-URL form labeled "Audit my site — free."

**Verdict: passes the 5-second test, with caveats.**

What lands (quote-for-quote):
- **The H1 itself.** "doorway-page gardening" is opinionated, technical, and specific. It tells a target operator they're being seen accurately. This is the strongest hero copy on the page.
- **The CTA verb.** "Audit my site — free" is action + price, no ambiguity.
- **The pre-headline eyebrow.** "Template-aware SpamBrain + AEO · v0.6.3" — for the target audience, those four nouns do real positioning work. SpamBrain triggers recognition; "Template-aware" telegraphs the v0.6 differentiator.

What does *not* land in 5 seconds:
- The **subheadline is a 67-word run-on** with five distinct claims: who it's for, time-to-value (60s), what it produces, the SpamBrain/AEO scope, and a "see scope below" disclaimer. A first-time visitor in scan mode will skim past it. The 5-second value prop survives only because the H1 and CTA carry the weight.
- **"AEO"** is jargon. Even technical operators won't all parse "Answer Engine Optimization" without the parenthetical — and the parenthetical lives in sentence 3 of the subheadline, well past the 5-second window.
- **The right column** (LiveDemo tile grid) is visually compelling but reads as decoration in 5 seconds. A first-time visitor doesn't know the tiles represent pages or what the colors mean until they read the caption beneath. The caption ("↑ Each tile = one page. Color = worst rule that fires…") is the explanation that should logically come first.

**Score on the 5-criteria headline rubric: 8/10.**
- Communicates core value: 2 (clearly — "audits your templates, not just URLs")
- Specific (numbers/outcomes): 1 (mentions v0.6 but no outcome metric)
- Addresses target audience: 2 (explicit — "programmatic SEO")
- Matches traffic source: 2 (assuming organic / dev-community / Twitter — the technical voice matches)
- Emotional + logical hook: 1 (logical — strong; emotional — "doorway-page gardening" is dry-witty, not pulse-raising)

---

## 2. Conversion friction map (ranked by severity)

### CRITICAL — fixing these moves the needle

**F1. Subheadline is too dense to function as a subheadline.**
The 67-word block under the H1 is doing the work of a feature section, not a subheadline. Best-in-class subheadlines are 1–2 sentences that *amplify* the headline with one piece of proof or specificity. Today, the subheadline buries the killer fact ("60 seconds, see which templates are broken and which are clean") under generic positioning.

**F2. Authorization checkbox is a mid-conversion hand-grenade.**
The TOS gate (`tosGateShown`) only appears *after* the user clicks Submit and gets rejected. A first-time visitor types a URL, hits Submit, sees an error message, and only *then* discovers they need to tick a box and complete a Turnstile widget. Two surprise gates in one click is a measurable friction event — at least one will abandon. The checkbox should appear inline before the CTA from the start, not after a failed submit.

**F3. CTA cluster has zero hierarchy below the fold.**
After the form, the user encounters: "No signup · 3 audits/day · 50 pages per audit · 24h retention (anon) · See all limits" — five constraints in one rapid line, which reads as caveats rather than reassurance. The "Analytics-safe" line below is genuinely useful trust signal copy, but it competes with the constraint line for attention.

**F4. Turnstile widget has a "loading" failure-mode visible to the user.**
> "Loading bot check… if this doesn't resolve in a few seconds, refresh the page."
This sentence tells the visitor *upfront* that the bot check is unreliable. Trust-erosion before the click. The fallback message should only appear after a real timeout (5–10 seconds), not as a permanent loading-state caption.

### HIGH — meaningful conversion drag

**F5. The "What pseolint isn't" section, while admirable, is positioned wrong.**
Listing competitors (Sitebulb, Screaming Frog, Ahrefs, Semrush) with their prices in section 2 of the page hands a high-intent visitor four exit ramps before they've understood the unique value. Self-qualifying is good; *teaching the visitor where else to spend money* is too generous. This belongs *after* the social proof / receipts section, not before — or as an FAQ entry.

**F6. The "Field report" / receipts section uses `.example` hostnames.**
"airport-hotels.example", "legal-directory.example" — the `.example` TLD signals "we have not earned the right to show real customer logos yet." A technical reader knows what that TLD means. It dilutes credibility precisely in the section meant to *build* it. Either redact with a different convention (e.g., "Hotel directory · 240k pages") or earn one real before/after.

**F7. Zero traditional social proof above the fold.**
No GitHub stars, no npm download counts, no customer logos, no "trusted by N teams." For an open-source product with public packages and a January 2026 launch, the absence of a single "★ 412 on GitHub · 3.2k weekly npm downloads" badge is a missed trust beat. The audience here *checks GitHub stars before they paste a URL*.

**F8. Pricing page H1 reads as a riddle.**
> "Audits stay free. Monitoring is the upgrade."
This is good positioning *if you already know the product*. For a visitor arriving directly to /pricing from a Google search ("pseolint pricing"), it doesn't say what pseolint is. The eyebrow ("Pricing · one plan") and H1 should self-contain the value prop in case this page is the entry point.

**F9. Pricing comparison table column "Free · $0" reads as parity, not contrast.**
13 rows; 4 of them are "—" / "Not included" on Free. The eye scans the Pro column and sees a wall of green checkmarks — but several Free cells are also long and feature-loaded ("K=10 per template, up to 200 pages"). Net effect: Free looks *almost as good* as Pro. The table is too generous to Free, which undersells the upgrade.

### MEDIUM — polish-tier

**F10. "By the numbers" section buries the strongest social proof — the regulatory dates — in long paragraphs.**
The four stat tiles (Median audit time, K per template, Pro plan, Anon retention) are good but not the most persuasive numbers. The SpamBrain dates (March 27, 2026 / May 7, 2024 / March 5, 2024) are the *credibility moat* and they're stuck inside a 90-word `<li>` block. Consider a dedicated visual timeline.

**F11. The CLI marquee mid-page is decoration.**
For non-technical/non-CLI visitors, scrolling past a band of CLI commands is a "this is too dev-only for me" signal. For technical visitors, it's an asset. Acceptable as-is given the audience, but recognize the cost.

**F12. Final CTA section is undersized.**
"One URL. 60 seconds. A per-template verdict you can ship." with two buttons. The first CTA *scrolls back to the top* (`document.getElementById("url")?.focus()`). This is fine but loses momentum — by the time the form is back in view the visitor has lost the conviction that brought them down here. Consider an inline form repeat at the bottom.

### LOW — won't move conversion meaningfully

**F13.** `text-[10px]` warm-it-first copy is functionally invisible.
**F14.** `placeholder="yoursite.com"` could be more specific (e.g., `placeholder="https://yoursite.com"`) since the form normalizes anyway.
**F15.** `inputMode="url"` is set but `type="text"` — should be `type="url"` for mobile keyboard.

---

## 3. What's working — credit where due

This is a strong page. Honest list:

- **Voice is consistent and earned.** "Doorway-page gardening" / "engineering rigor, not marketing" / "one structural fix, not 240,000" — this is the kind of writing that makes technical operators trust the engine. Do not flatten it.
- **Specificity is the moat.** "94% of pages scored below 30," "240k pages," "300 words," "85% SimHash similarity" — every paragraph has at least one number. This is the page-cro framework's #1 ask, and pseolint nails it.
- **Regulatory grounding is unique and defensible.** The March 27, 2026 / May 7, 2024 / March 5, 2024 / 2022 SpamBrain rebuild dates are the page's competitive moat. Other audit tools don't write like this. *Protect this voice element under all redesigns.*
- **The TemplateBreakdownHero earns its position** (more on this in §5).
- **The "Scope" section is brave.** Most marketing pages won't tell you what they aren't. This one does, and it builds trust *with the right buyer*. Just reposition it (see F5).
- **Pricing page narrative is correct.** "Audits stay free. Monitoring is the upgrade." is the right strategic frame. The "Why we chose this pricing model" section reads as the founder explaining their thinking — rare and persuasive.
- **The FAQ on pricing handles 5/5 universal objections** (price, situation fit, setup, alternatives, cancel risk). This is exemplary.
- **"BYO AI key, no markup"** is a high-trust differentiator buried in the comparison table. It deserves more visual weight.
- **`autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`** on the URL input — these are the mark of someone who has actually used a phone to paste a URL. Detail-craft compounds.

---

## 4. Specific recommendations (ranked by expected impact)

### R1. Tighten the subheadline to one sentence + one specificity. [HIGH IMPACT, LOW EFFORT]

**Current (67 words):**
> "An audit specifically for programmatic-SEO sites (template-driven content at scale) and AI Overview readiness. Paste your site. In 60 seconds, see which templates are broken and which are clean — site-type-aware scoring across SpamBrain classifier triggers and Answer Engine Optimization (how citable your pages are to ChatGPT, Perplexity, and Google AI Overviews). Not a general SEO audit — see scope below."

**Recommended (28 words, voice preserved):**
> "Paste a URL. In 60 seconds, see which template clusters trip SpamBrain and which pages get cited by ChatGPT, Perplexity, and Google AI Overviews."

Move the "Not a general SEO audit" disclaimer into the existing "Scope" section's eyebrow tag (it already says exactly this). Move the "AEO = Answer Engine Optimization" gloss into the eyebrow line: change `Template-aware SpamBrain + AEO · v0.6.3` to `Template-aware SpamBrain + Answer Engine Optimization · v0.6.3` — costs 4 words, removes a glossary lookup.

### R2. Show the TOS checkbox inline from the start. [HIGH IMPACT, LOW EFFORT]

Remove `tosGateShown && (...)` conditional. Always render the authorization checkbox between the URL input and the Turnstile widget. Once `localStorage[TOS_STORAGE_KEY] === "1"`, hide it (already implemented as state). The current "show on failed submit" pattern guarantees a friction surprise for every first-time visitor who doesn't already have the localStorage key.

### R3. Add a one-line social proof bar above the fold. [HIGH IMPACT, LOW EFFORT]

Below the CTA, before the constraints line, add:
> ⭐ N stars on GitHub · M weekly npm downloads · MIT licensed

Even if N and M are modest, the *presence* of GitHub-native social proof anchors credibility for the target audience faster than any testimonial would. This is the single highest-leverage missing element on the page.

### R4. Restructure pricing comparison table to widen the gap. [HIGH IMPACT, MEDIUM EFFORT]

Reorder rows so the 4 "Not included" rows cluster at the bottom of the table (currently they're scattered: rows 3, 7, 9 [—], 10 [—], 11). When 4 consecutive Free cells say "Not included" the visual cliff between Free and Pro becomes obvious. Also: change "30 days" Free retention to "30 days (signed in) · 24h (anonymous)" so the row tells the *full* story rather than over-stating Free generosity.

### R5. Promote `BYO AI key, no markup` to its own pricing benefit card. [MEDIUM IMPACT, LOW EFFORT]

This is the most differentiated thing about Pro pricing — competitors (Sitebulb, Ahrefs) bundle AI features at marked-up cost. Today it's row 6 of a 13-row table. Make it a `<li>` in the `PRO_FEATURES` grid with title "BYO API key, zero markup" and detail explaining the daily-budget-cap fallback. This is competitive *attack copy*, not feature copy.

### R6. Reposition "What pseolint isn't" below "Field report." [MEDIUM IMPACT, LOW EFFORT]

The honest-disqualifier section is gold, but it's currently the second section a visitor sees. Move it after the receipts section so visitors who *should* convert see the proof first, and only the wrong-fit visitors hit the offramp list.

### R7. Rewrite the pricing H1 for direct-traffic context. [MEDIUM IMPACT, LOW EFFORT]

**Current:** "Audits stay free. *Monitoring* is the upgrade."

**Recommended:**
> "Audits stay free forever. Pay only when you need pseolint to *watch* a domain — daily diff-audits, fix queue, alerts on template regression."

Keeps the core positioning, adds enough specificity to stand alone for a /pricing direct-arrival.

### R8. Replace `.example` hostnames in receipts with redacted-but-real metadata. [LOW IMPACT, MEDIUM EFFORT]

E.g., "Travel directory · ~240k pages" instead of `airport-hotels.example`. The hostname is doing the work of a logo, and `.example` reads as "we don't have permission to show this." Removing the hostname entirely is more honest than fake-domaining it.

### R9. Add `type="url"` to the URL input. [LOW IMPACT, NO EFFORT]
Mobile keyboards will surface the `.com` key.

### R10. Inline the final-CTA form, don't scroll-up. [LOW IMPACT, MEDIUM EFFORT]
Repeat the URL input + button at the bottom CTA section so visitors who reached it can convert in place.

---

## 5. TemplateBreakdownHero feedback

**Does it earn its prominence?** Yes, with one structural caveat.

**What's working:**
- The 3-card grid is the *visual proof of the v0.6 thesis*. The H1 says "audits your templates, not just URLs" — the TemplateCard grid shows what that produces. This is the rare landing-page asset where the visual *is* the value proposition. Rare and good.
- The annotation callout (`This is the site verdict.`) is the single best piece of explanatory copy on the page. It directly closes the loop: "/listing/:slug covers 97.3% of the site — so its concerning verdict drives the headline, even though /article/:slug is clean." A reader who skims everything else and reads only this paragraph understands v0.6.
- **The v0.5 vs v0.6 comparison footer is excellent and I would not change it.** The "200 URLs, 1 pool" → "30 fetches, 3 verdicts" framing is a textbook before-after-bridge. The proportional segment bars on the v0.5 side (97% / 2% / 1%) visually demonstrate the "thin-content crisis averages out" claim from the copy. This is the page's most persuasive asset for a technical reader who already understands sampling.

**What's not working:**
- **Position relative to the fold.** TemplateBreakdownHero is rendered *after* the form section (`<TemplateBreakdownHero />` follows the hero `<section>`). On a typical 1440×900 desktop, the user has to scroll to see it. The H1 promises "audits your templates, not just URLs" — and the literal demonstration of that promise is one scroll away. Consider: does this asset belong *above* or *next to* the LiveDemo tile-grid? Right now it competes with the LiveDemo for the "hero visual" job; the LiveDemo is decorative-cool, the TemplateBreakdownHero is *informative*. The latter is more valuable for first-time visitors. **Recommendation: move TemplateBreakdownHero up — make it the first section after the hero form, not the second.** (It is technically already the first section after the hero; verify visually that the LiveDemo column doesn't push it below the fold on common viewports.)
- **Mock data realism.** The audited URL lists (`new-york-accountants`, `los-angeles-attorneys`) are the right *shape* for a programmatic legal-directory site, which matches the audience. Good. But all 10 cities are real-US-cities, all 10 categories are real-professions — the pattern is so on-the-nose it reads as "we built this for a contractor-directory demo." Consider mixing the URL examples to look like a real directory's slug slop (e.g., `nyc-cpa`, `attorneys-los-angeles-ca`, etc.) — irregular casing/format makes the "templates exist regardless of slug variation" point implicitly.
- **`/article/:slug` showing only 89 URLs vs 8,201 for `/listing/:slug`.** The numbers tell the right story (one template dominates), but the *visual cards* are the same size. A reader has to read the small "X / Y URLs (Z%)" text to grasp the dominance. The annotation callout pulls this together with "97.3% of the site" — but the cards themselves don't visually encode coverage. Consider sizing card border-weight or background opacity by coverage % so the dominant template is *visibly* dominant before the annotation explains it. Optional polish.
- **"v0.5 vs v0.6 comparison" works for existing users; how does it read to a first-time visitor?** A visitor who has never heard of pseolint v0.5 sees "before & after" framing and reads it as a generic "old way / new way" comparison — which is *fine* and arguably better than internal-version-history framing. No change needed; just confirming it doesn't require prior product knowledge.

**Verdict on the TemplateBreakdownHero:** earns its space, ships the v0.6 story credibly. Two small refinements (move slightly higher in the page; reconsider mock-URL realism) would make it best-in-class.

---

## Summary scorecard

| Dimension | Score | Notes |
|---|---|---|
| Value Prop Clarity | 8/10 | H1 is excellent, subheadline drags |
| Headline Effectiveness | 8/10 | Voice-perfect, missing outcome metric |
| CTA Hierarchy | 7/10 | Primary CTA is clear; below-fold final CTA undersized |
| Visual Hierarchy | 7/10 | LiveDemo competes with TemplateBreakdownHero |
| Social Proof | 4/10 | Zero GitHub/npm proof; receipts use `.example` TLDs |
| Objection Handling | 9/10 | Pricing FAQ is exemplary; "Scope" section handles fit objection |
| Friction | 6/10 | Surprise TOS-gate-on-submit + Turnstile loading copy |
| **Overall** | **7.0/10** | Strong technical-voice page; social proof gap and friction surprises are the highest-impact fixes |

**Top 3 fixes by ROI:**
1. R2 — TOS checkbox inline from start (eliminates surprise friction event)
2. R1 — Subheadline tightening (frees the 5-second value prop)
3. R3 — GitHub/npm social proof above fold (closes the credibility-gap-with-the-right-audience problem)
