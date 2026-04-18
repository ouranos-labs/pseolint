import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { promptTriageFeedback } from "../../src/ai/feedback-prompt.js";

/**
 * Construct a pair of TTY-like PassThrough streams for input and output. The
 * `isTTY` flag is what `promptTriageFeedback` inspects to decide whether to
 * even render the prompt, so attaching it here lets the prompt run.
 */
function makeTtyStreams(): { input: PassThrough; output: PassThrough } {
  const input = new PassThrough();
  const output = new PassThrough();
  Object.assign(input, { isTTY: true });
  Object.assign(output, { isTTY: true });
  return { input, output };
}

/**
 * Push a line into the stream on the next tick so the readline interface has
 * time to attach its `line` listener before data arrives.
 */
function sendLine(stream: PassThrough, line: string): void {
  setImmediate(() => {
    stream.write(line + "\n");
  });
}

describe("promptTriageFeedback — TTY gating", () => {
  it("returns \"skipped\" when input is not a TTY", async () => {
    const input = new PassThrough(); // no isTTY
    const output = new PassThrough();
    Object.assign(output, { isTTY: true });
    const rating = await promptTriageFeedback({ input, output, timeoutMs: 100 });
    expect(rating).toBe("skipped");
  });

  it("returns \"skipped\" when output is not a TTY", async () => {
    const input = new PassThrough();
    Object.assign(input, { isTTY: true });
    const output = new PassThrough(); // no isTTY
    const rating = await promptTriageFeedback({ input, output, timeoutMs: 100 });
    expect(rating).toBe("skipped");
  });

  it("returns \"skipped\" when neither stream is a TTY", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const rating = await promptTriageFeedback({ input, output, timeoutMs: 100 });
    expect(rating).toBe("skipped");
  });
});

describe("promptTriageFeedback — response parsing", () => {
  it.each(["y", "yes", "helpful", "Y", "YES", "Helpful", "  yes  "])(
    "returns \"helpful\" for %j",
    async (answer) => {
      const { input, output } = makeTtyStreams();
      sendLine(input, answer);
      const rating = await promptTriageFeedback({ input, output, timeoutMs: 1000 });
      expect(rating).toBe("helpful");
    },
  );

  it.each(["n", "no", "unhelpful", "N", "NO", "Unhelpful", "  no  "])(
    "returns \"unhelpful\" for %j",
    async (answer) => {
      const { input, output } = makeTtyStreams();
      sendLine(input, answer);
      const rating = await promptTriageFeedback({ input, output, timeoutMs: 1000 });
      expect(rating).toBe("unhelpful");
    },
  );

  it("returns \"skipped\" for empty input", async () => {
    const { input, output } = makeTtyStreams();
    sendLine(input, "");
    const rating = await promptTriageFeedback({ input, output, timeoutMs: 1000 });
    expect(rating).toBe("skipped");
  });

  it("returns \"skipped\" for unrecognized input (e.g. \"maybe\")", async () => {
    const { input, output } = makeTtyStreams();
    sendLine(input, "maybe");
    const rating = await promptTriageFeedback({ input, output, timeoutMs: 1000 });
    expect(rating).toBe("skipped");
  });

  it("returns \"skipped\" on timeout when no input arrives", async () => {
    const { input, output } = makeTtyStreams();
    // Do not write anything. Use a short timeout.
    const rating = await promptTriageFeedback({ input, output, timeoutMs: 50 });
    expect(rating).toBe("skipped");
  });
});
