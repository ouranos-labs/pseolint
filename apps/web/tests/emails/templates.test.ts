// apps/web/tests/emails/templates.test.ts
//
// Email QA via @emailens/engine. Renders each email template through
// @react-email/render and pipes the resulting HTML through the engine's
// compatibility + spam analyzers.
//
// API used (from @emailens/engine ^0.9.1):
//   - analyzeEmail(html, framework)            -> CSSWarning[]
//   - generateCompatibilityScore(warnings)     -> Record<clientId, { score, ... }>
//   - analyzeSpam(html)                        -> { score, level, issues }
//
// Note on score semantics: @emailens uses a 0–100 scale where HIGHER is
// CLEANER (100 = clean). The original spec asked for "spam score ≤ 5"
// assuming a SpamAssassin-style lower-is-better scale; we adapt to the
// actual API and assert spam.score >= 70 instead.
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@react-email/render";
import { analyzeEmail, generateCompatibilityScore, analyzeSpam } from "@emailens/engine";
import MagicLinkEmail from "@/emails/MagicLinkEmail";

const MIN_COMPATIBILITY_SCORE = 70;
const MIN_SPAM_SCORE = 70; // higher = cleaner per @emailens semantics

describe("email templates QA (via @emailens/engine)", () => {
  it("MagicLinkEmail meets compatibility + spam thresholds", async () => {
    const html = await render(
      React.createElement(MagicLinkEmail, { url: "https://example.com/auth/callback?token=abc" })
    );
    expect(html.length).toBeGreaterThan(0);

    const warnings = analyzeEmail(html, "jsx");
    const scores = generateCompatibilityScore(warnings);
    const perClientScores = Object.values(scores).map((s) => s.score);
    expect(perClientScores.length).toBeGreaterThan(0);

    const minScore = Math.min(...perClientScores);
    expect(minScore, `worst per-client compatibility score (${minScore})`).toBeGreaterThanOrEqual(
      MIN_COMPATIBILITY_SCORE
    );

    const spam = analyzeSpam(html);
    expect(spam.score, `spam score (${spam.score})`).toBeGreaterThanOrEqual(MIN_SPAM_SCORE);
    expect(spam.level).not.toBe("high");
  });
});
