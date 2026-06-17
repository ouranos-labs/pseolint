import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";
import { RULE_KNOWLEDGE } from "../src/okf-knowledge.js";
import { connect } from "./helpers.js";

describe("rule knowledge resources", () => {
  it("exposes one resource per published rule plus an index", async () => {
    const client = await connect(createServer());
    const { resources } = await client.listResources();
    const uris = new Set(resources.map((r) => r.uri));

    expect(uris.has("pseolint://rules")).toBe(true);
    for (const rule of RULE_KNOWLEDGE) {
      expect(uris.has(`pseolint://rules/${rule.ruleId}`)).toBe(true);
    }
  });

  it("reads a rule resource keyed by the same ruleId findings carry", async () => {
    const client = await connect(createServer());
    const res = await client.readResource({ uri: "pseolint://rules/spam/thin-content" });
    const text = res.contents[0]?.text as string;

    expect(res.contents[0]?.mimeType).toBe("text/markdown");
    expect(text).toContain("## How to fix");
    expect(text).toContain("spam/thin-content");
  });

  it("has a unique, well-formed entry for every rule", () => {
    const ids = RULE_KNOWLEDGE.map((r) => r.ruleId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RULE_KNOWLEDGE) {
      expect(r.ruleId).toMatch(/^[a-z]+\/[a-z-]+$/);
      expect(r.howToFix.length).toBeGreaterThan(0);
    }
  });
});
