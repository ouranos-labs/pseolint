import readline from "node:readline";

export type FeedbackRating = "helpful" | "unhelpful" | "skipped";

export interface PromptOptions {
  /** Maximum time to wait for user input in milliseconds. Default: 15000. */
  timeoutMs?: number;
  /** Input stream (defaults to process.stdin). Must be a TTY. */
  input?: NodeJS.ReadableStream;
  /** Output stream (defaults to process.stderr). Must be a TTY. */
  output?: NodeJS.WritableStream;
}

/**
 * Prompts the user once for triage feedback (y/n/skip).
 *
 * Returns "skipped" immediately on non-TTY or if either stream is not a TTY.
 * Waits up to timeoutMs for input; if no input is received, returns "skipped".
 *
 * Accepted responses (case-insensitive):
 *   - helpful:   "y", "yes", "helpful"
 *   - unhelpful: "n", "no", "unhelpful"
 *   - anything else (including empty) returns "skipped".
 */
export async function promptTriageFeedback(
  opts: PromptOptions = {}
): Promise<FeedbackRating> {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stderr;
  const inIsTty = (input as unknown as { isTTY?: boolean }).isTTY === true;
  const outIsTty = (output as unknown as { isTTY?: boolean }).isTTY === true;
  if (!inIsTty || !outIsTty) return "skipped";

  const timeoutMs = opts.timeoutMs ?? 15000;
  const rl = readline.createInterface({ input, output, terminal: true });
  output.write("\nWas this triage helpful? [y/n/skip] ");

  try {
    const answer = await Promise.race<string>([
      new Promise<string>((resolve) => rl.once("line", resolve)),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), timeoutMs)),
    ]);
    const t = answer.trim().toLowerCase();
    if (t === "y" || t === "yes" || t === "helpful") return "helpful";
    if (t === "n" || t === "no" || t === "unhelpful") return "unhelpful";
    return "skipped";
  } finally {
    rl.close();
  }
}
