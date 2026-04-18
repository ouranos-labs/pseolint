import { AdapterError, type LlmAdapter, type LlmRequest, type LlmResponse } from "../types.js";

export interface OllamaAdapterConfig {
  model: string;
  endpoint?: string;
}

const DEFAULT_ENDPOINT = "http://localhost:11434";

export function createOllamaAdapter(config: OllamaAdapterConfig): LlmAdapter {
  const endpoint = (config.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");

  return {
    id: "ollama",
    model: config.model,
    estimateInputTokens(req: LlmRequest): number {
      return Math.ceil((req.system.length + req.user.length) / 4);
    },
    async chat(req: LlmRequest, opts): Promise<LlmResponse> {
      const url = `${endpoint}/api/chat`;
      const body = {
        model: config.model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        options: opts?.maxOutputTokens ? { num_predict: opts.maxOutputTokens } : undefined,
      };

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: opts?.signal,
        });
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.name === "AbortError") throw err;
        if (err.code === "ECONNREFUSED" || /econnrefused/i.test(err.message)) {
          throw new AdapterError(`Ollama not reachable at ${endpoint}`, "network", e);
        }
        throw new AdapterError(`Ollama network error: ${err.message}`, "network", e);
      }

      if (res.status === 404) {
        throw new AdapterError(
          `Model "${config.model}" not pulled. Run: ollama pull ${config.model}`,
          "invalid-response",
        );
      }
      if (res.status >= 500) {
        throw new AdapterError(`Ollama server returned ${res.status}`, "server");
      }
      if (!res.ok) {
        throw new AdapterError(`Ollama returned ${res.status}`, "invalid-response");
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch (e) {
        throw new AdapterError(`Ollama returned non-JSON body`, "invalid-response", e);
      }
      const obj = data as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };
      const text = obj.message?.content;
      if (typeof text !== "string") {
        throw new AdapterError(`Ollama response missing message.content`, "invalid-response");
      }
      return {
        text,
        usage: {
          input: obj.prompt_eval_count ?? 0,
          output: obj.eval_count ?? 0,
        },
      };
    },
  };
}
