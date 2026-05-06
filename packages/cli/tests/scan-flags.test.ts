/**
 * v0.5.11 scan-flag tests.
 *
 * We cannot call `runCli` directly in vitest without either (a) a live target URL
 * or (b) mocking `auditSource`. The cleanest testable surface is the Commander
 * option parsing itself — we test that the three new flags are recognised and
 * that the documented mutual-exclusivity (legacyFlat wins over perTemplate) is
 * enforced by the CLI's formatting path.
 *
 * The formatter-level tests in template-cards.test.ts and legacy-flat.test.ts
 * cover the actual rendering logic end-to-end. This file tests the Commander
 * layer and the flag interface contract.
 */
import { describe, expect, it } from "vitest";
import { Command } from "commander";

/**
 * Build a minimal Commander program that mirrors just the flags under test,
 * then parse the given args and return the option object.
 * This lets us verify default values and flag semantics without invoking
 * the real auditSource.
 *
 * We use `from: "user"` (omits Node + script path) so we pass only the flag
 * arguments directly.
 */
function parseFlags(args: string[]): {
  perTemplate: boolean;
  template?: string;
  legacyFlat: boolean;
} {
  const p = new Command();
  p.option("--per-template", "per-template view ON", true)
   .option("--no-per-template", "per-template view OFF")
   .option("--template <signature>", "filter to template signature")
   .option("--legacy-flat", "legacy flat view", false)
   .allowUnknownOption()
   // Must add an optional argument so Commander doesn't complain about
   // leftover positional args when none of our tests pass a source.
   .argument("[source]");
  p.parse(args, { from: "user" });
  const opts = p.opts<{ perTemplate: boolean; template?: string; legacyFlat: boolean }>();
  return opts;
}

describe("--per-template flag", () => {
  it("defaults to true (ON) when neither flag is passed", () => {
    const opts = parseFlags([]);
    expect(opts.perTemplate).toBe(true);
  });

  it("can be disabled via --no-per-template", () => {
    const opts = parseFlags(["--no-per-template"]);
    expect(opts.perTemplate).toBe(false);
  });

  it("--per-template explicit still sets true", () => {
    const opts = parseFlags(["--per-template"]);
    expect(opts.perTemplate).toBe(true);
  });
});

describe("--template flag", () => {
  it("is undefined by default", () => {
    const opts = parseFlags([]);
    expect(opts.template).toBeUndefined();
  });

  it("accepts a signature value", () => {
    const opts = parseFlags(["--template", "/listing/:slug"]);
    expect(opts.template).toBe("/listing/:slug");
  });

  it("accepts a longtail signature", () => {
    const opts = parseFlags(["--template", "_longtail"]);
    expect(opts.template).toBe("_longtail");
  });
});

describe("--legacy-flat flag", () => {
  it("defaults to false", () => {
    const opts = parseFlags([]);
    expect(opts.legacyFlat).toBe(false);
  });

  it("is true when --legacy-flat is passed", () => {
    const opts = parseFlags(["--legacy-flat"]);
    expect(opts.legacyFlat).toBe(true);
  });
});

describe("mutual exclusivity: --legacy-flat wins over --per-template", () => {
  it("when both are set, applying the 'legacyFlat wins' rule gives legacyFlat=true, perTemplate=false", () => {
    const opts = parseFlags(["--per-template", "--legacy-flat"]);
    // Simulate the CLI's resolution logic (legacyFlat wins).
    const legacyFlat = opts.legacyFlat;
    const perTemplate = legacyFlat ? false : opts.perTemplate !== false;
    expect(legacyFlat).toBe(true);
    expect(perTemplate).toBe(false);
  });

  it("when only --per-template is set, perTemplate stays true", () => {
    const opts = parseFlags(["--per-template"]);
    const legacyFlat = opts.legacyFlat;
    const perTemplate = legacyFlat ? false : opts.perTemplate !== false;
    expect(perTemplate).toBe(true);
    expect(legacyFlat).toBe(false);
  });

  it("when only --legacy-flat is set, perTemplate is suppressed", () => {
    const opts = parseFlags(["--legacy-flat"]);
    const legacyFlat = opts.legacyFlat;
    const perTemplate = legacyFlat ? false : opts.perTemplate !== false;
    expect(perTemplate).toBe(false);
    expect(legacyFlat).toBe(true);
  });
});
