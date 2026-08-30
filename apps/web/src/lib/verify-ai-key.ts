import "server-only";
import { createLanguageModel } from "@pseolint/core";

export type VerifyResult =
  | { ok: true; modelId: string }
  | { ok: false; reason: string };

/** Hard cap so a hung provider cannot hold a server action open. */
const TIMEOUT_MS = 15_000;

/**
 * Prove a key works before storing it.
 *
 * One-token generation against the chosen model. That is the only check that
 * actually answers the user's question, because a key can be well-formed, live,
 * and still be denied for the specific model (no credit, wrong org, model not
 * enabled on the account). A regex on the prefix would pass all of those.
 *
 * Cost is negligible (`maxOutputTokens: 1`) and it runs once per save, not per
 * audit. Failures return the provider's own message: "insufficient_quota" is a
 * far more useful thing to show than "invalid key".
 */
export async function verifyAiKey(opts: {
  provider: string;
  apiKey?: string;
  model?: string;
  endpoint?: string;
}): Promise<VerifyResult> {
  try {
    const { model, modelId } = await createLanguageModel({
      provider: opts.provider,
      apiKey: opts.apiKey,
      model: opts.model,
      endpoint: opts.endpoint,
    });

    // Imported here rather than at module scope: `ai` is only needed on this
    // path, and the route that renders the form should not pay for it.
    const { generateText } = await import("ai");
    await generateText({
      model,
      prompt: "ok",
      maxOutputTokens: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: true, modelId };
  } catch (e) {
    return { ok: false, reason: explain(e, opts.provider) };
  }
}

/**
 * Turn a provider SDK error into one line a user can act on. The raw errors are
 * long, contain the request body, and sometimes echo the key back, so this
 * both shortens them and keeps the secret out of any surface that renders it.
 */
function explain(e: unknown, provider: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();

  if (lower.includes("timeouterror") || lower.includes("aborted") || lower.includes("timed out")) {
    return provider === "ollama"
      ? "No response from the Ollama endpoint. Is the daemon running and reachable from our servers?"
      : "The provider did not respond in time. Try again.";
  }
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("invalid api key") || lower.includes("invalid x-api-key")) {
    return "The provider rejected this key (401). Check you copied it whole, and that it has not been revoked.";
  }
  if (lower.includes("403") || lower.includes("permission")) {
    return "The key is valid but not permitted to use this model (403). Check the model name and your account's access.";
  }
  if (lower.includes("404") || lower.includes("model_not_found") || lower.includes("not found")) {
    return "That model does not exist for this provider. Leave the model blank to use the default.";
  }
  if (lower.includes("quota") || lower.includes("credit") || lower.includes("billing") || lower.includes("429")) {
    return "The key works but the account has no available quota or credit.";
  }
  if (lower.includes("requires") && lower.includes("install")) {
    return "This provider is not available on this deployment (its SDK is not installed).";
  }
  // Unrecognised: pass the provider's own words through, truncated. Never echo
  // more than a line, since some SDKs put the request payload in the message.
  const firstLine = raw.split("\n")[0]!.trim();
  return firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine;
}
