import { describe, it, expect } from "vitest";
import { listSupportedProviders } from "@pseolint/core";
import { aiProviderOptions, knownProviderIds } from "@/lib/ai-providers";

/**
 * Guards the exact bug this module exists to prevent.
 *
 * The dashboard used to hardcode its own four-provider dropdown. Two of those
 * four had no installed SDK, so a user could pick OpenAI, save a valid key, and
 * only discover at audit time - hours later, with no visible error - that the
 * provider could never have worked. Nothing in CI noticed, because nothing tied
 * the list the UI offered to the list the engine could build.
 */
describe("ai provider catalog", () => {
  it("offers exactly what the engine registry knows, no more and no less", async () => {
    const registry = listSupportedProviders().map((p) => p.id).sort();
    const offered = (await aiProviderOptions()).map((p) => p.id).sort();
    expect(offered).toEqual(registry);
    expect([...knownProviderIds()].sort()).toEqual(registry);
  });

  it("gives every provider the display metadata the form renders", async () => {
    for (const p of await aiProviderOptions()) {
      // A missing label would render the raw id; a missing default model would
      // render an empty placeholder in the "leave blank for…" hint.
      expect(p.label, `${p.id} has no label`).toBeTruthy();
      expect(p.label, `${p.id} fell back to its raw id`).not.toBe(p.id);
      expect(p.defaultModel, `${p.id} has no default model`).toBeTruthy();
    }
  });

  it("marks every provider installable in this workspace", async () => {
    // apps/web depends on all eight SDKs directly. If one is dropped from
    // package.json, the dashboard would quietly render it disabled rather than
    // failing anywhere visible, so assert it here instead.
    const notInstalled = (await aiProviderOptions()).filter((p) => !p.installed).map((p) => p.id);
    expect(notInstalled).toEqual([]);
  });

  it("treats Ollama as the only keyless provider", async () => {
    const keyless = (await aiProviderOptions()).filter((p) => !p.needsKey).map((p) => p.id);
    expect(keyless).toEqual(["ollama"]);
  });
});
