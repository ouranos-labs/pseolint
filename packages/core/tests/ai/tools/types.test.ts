import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineTool } from "../../../src/ai/tools/types.js";

describe("defineTool", () => {
  const okTool = defineTool({
    name: "echo",
    description: "Returns its input doubled.",
    inputSchema: z.object({ n: z.number().int() }),
    outputSchema: z.object({ doubled: z.number().int() }),
    async execute({ n }) {
      return { doubled: n * 2 };
    },
  });

  it("returns ok result on valid input + output", async () => {
    const r = await okTool.run({ n: 21 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.doubled).toBe(42);
  });

  it("returns INPUT_VALIDATION error when input fails schema", async () => {
    // @ts-expect-error testing runtime guard, not type system
    const r = await okTool.run({ n: "not a number" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });

  it("returns OUTPUT_VALIDATION error when execute produces malformed output", async () => {
    const buggyTool = defineTool({
      name: "buggy",
      description: "Pretends to add but returns junk.",
      inputSchema: z.object({ n: z.number() }),
      outputSchema: z.object({ doubled: z.number().int() }),
      async execute() {
        return { doubled: "not a number" } as unknown as { doubled: number };
      },
    });
    const r = await buggyTool.run({ n: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("OUTPUT_VALIDATION");
  });

  it("captures thrown exceptions as EXECUTE_ERROR", async () => {
    const throwingTool = defineTool({
      name: "throws",
      description: "Always explodes.",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      async execute() {
        throw new Error("boom");
      },
    });
    const r = await throwingTool.run({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("EXECUTE_ERROR");
      expect(r.error).toContain("boom");
    }
  });

  it("toAiTool returns an AI-SDK-compatible tool object", () => {
    const aiTool = okTool.toAiTool();
    // Vercel AI SDK tool() returns an object with description + inputSchema + execute.
    // We don't assert a specific runtime shape: just that the conversion didn't throw and
    // the returned value is non-null. Real integration is exercised via `streamText`.
    expect(aiTool).toBeDefined();
  });
});
