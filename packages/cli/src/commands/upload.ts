import { readFile } from "node:fs/promises";

/**
 * POST a parsed audit summary to the pseolint Pro ingestion endpoint.
 * The summary should already be the JSON-output shape (what `pseolint scan
 * --format json` produces). Used both by the standalone `upload` command
 * and the v0.5.6 inline `--upload-to` shortcut on the main scan command.
 */
export async function uploadSummary(args: {
  summary: unknown;
  token: string;
  domainId: string;
  endpoint?: string;
}): Promise<{ ingested: number }> {
  const endpoint = args.endpoint ?? process.env.PSEOLINT_ENDPOINT ?? "https://pseolint.dev";
  const url = `${endpoint.replace(/\/$/, "")}/api/audits/upload`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${args.token}`,
    },
    body: JSON.stringify({ domainId: args.domainId, summary: args.summary }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { ingested: number };
}

export async function uploadCommand(args: {
  reportPath: string;
  token: string;
  domainId: string;
  endpoint?: string;
}): Promise<void> {
  const raw = await readFile(args.reportPath, "utf8");
  let summary: unknown;
  try {
    summary = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${args.reportPath}`);
  }
  const j = await uploadSummary({
    summary,
    token: args.token,
    domainId: args.domainId,
    endpoint: args.endpoint,
  });
  console.log(`uploaded: ${j.ingested} findings → ${args.domainId}`);
}
