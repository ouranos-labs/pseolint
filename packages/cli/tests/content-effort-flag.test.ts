/**
 * `--content-effort` CLI flag wiring.
 *
 * Mirrors the `--ai` triage opt-in. The flag funnels into
 * AuditOptions.contentEffort ({ enabled, model?, cacheDir? }), which the engine
 * consumes via an LLM content-effort judge that moderates the verdict ±1 tier
 * (fail-safe / no-op without ANTHROPIC_API_KEY). Here we cover the mergeOptions
 * pass-through this CLI added.
 */
import { describe, expect, it } from "vitest";
import { mergeOptions } from "../src/config.js";

describe("mergeOptions: contentEffort pass-through", () => {
  it("enabling the flag sets contentEffort.enabled === true", () => {
    expect(mergeOptions({}, { contentEffort: { enabled: true } }).contentEffort?.enabled).toBe(true);
  });
  it("threads a model override into AuditOptions", () => {
    const merged = mergeOptions({}, { contentEffort: { enabled: true, model: "claude-opus-4-6" } });
    expect(merged.contentEffort?.enabled).toBe(true);
    expect(merged.contentEffort?.model).toBe("claude-opus-4-6");
  });
  it("leaves contentEffort unset when no flag is given", () => {
    expect(mergeOptions({}, {}).contentEffort).toBeUndefined();
  });
  it("CLI value merges over a config-file value", () => {
    const merged = mergeOptions(
      { contentEffort: { enabled: false, model: "config-model" } },
      { contentEffort: { enabled: true, model: "cli-model" } },
    );
    expect(merged.contentEffort?.enabled).toBe(true);
    expect(merged.contentEffort?.model).toBe("cli-model");
  });
  it("partial CLI override preserves untouched config-file fields", () => {
    const merged = mergeOptions(
      { contentEffort: { enabled: true, model: "config-model" } },
      { contentEffort: { model: "cli-model" } },
    );
    expect(merged.contentEffort?.enabled).toBe(true);
    expect(merged.contentEffort?.model).toBe("cli-model");
  });
});
