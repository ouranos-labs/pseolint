import { describe, it, expect } from "vitest";
import { orchestratorTools } from "../../../src/ai/tools/index.js";
import { generateCitationLiftTool } from "../../../src/ai/tools/generate-citation-lift.js";

describe("generate_citation_lift registration", () => {
  it("is in the orchestrator registry under its name", () => {
    expect(orchestratorTools.generate_citation_lift).toBe(generateCitationLiftTool);
    expect(generateCitationLiftTool.name).toBe("generate_citation_lift");
  });

  it("rejects input missing the target query before any model call", async () => {
    const r = await generateCitationLiftTool.run({ pageId: "p1" } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });

  it("captures a bad pageId as a clean error, not a throw", async () => {
    // No fetch_page ran, so the id is unknown — resolvePage throws, and defineTool
    // must surface it as { ok:false } so the orchestrator loop keeps going.
    const r = await generateCitationLiftTool.run({ pageId: "nope", query: "what is x?" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("EXECUTE_ERROR");
  });
});
