import { readFile } from "node:fs/promises";

export async function uploadCommand(args: {
  reportPath: string;
  token: string;
  domainId: string;
  endpoint?: string;
}): Promise<void> {
  const endpoint = args.endpoint ?? process.env.PSEOLINT_ENDPOINT ?? "https://pseolint.dev";
  const url = `${endpoint.replace(/\/$/, "")}/api/audits/upload`;
  const raw = await readFile(args.reportPath, "utf8");
  let summary: unknown;
  try {
    summary = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${args.reportPath}`);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${args.token}`,
    },
    body: JSON.stringify({ domainId: args.domainId, summary }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }

  const j = (await res.json()) as { ingested: number };
  console.log(`uploaded: ${j.ingested} findings → ${args.domainId}`);
}
