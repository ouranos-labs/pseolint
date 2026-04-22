import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

import { devFlags } from "@/lib/dev-flags";

const DEV_SKIP_R2 = devFlags.r2Disabled;

// Pin to globalThis so the Map survives HMR and is shared across route-handler / page bundles.
const GLOBAL_KEY = Symbol.for("pseolint.devR2Store");
type DevStoreGlobal = typeof globalThis & { [GLOBAL_KEY]?: Map<string, string> };
const devStore: Map<string, string> = (() => {
  const g = globalThis as DevStoreGlobal;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, string>();
  return g[GLOBAL_KEY];
})();

function client(): S3Client {
  const e = env();
  return new S3Client({
    region: "auto",
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
  });
}

export async function uploadReport(key: string, html: string): Promise<void> {
  if (DEV_SKIP_R2) {
    devStore.set(key, html);
    return;
  }
  await client().send(new PutObjectCommand({
    Bucket: env().R2_BUCKET, Key: key, Body: html, ContentType: "text/html; charset=utf-8",
  }));
}

export async function uploadSummary(key: string, json: string): Promise<void> {
  if (DEV_SKIP_R2) {
    devStore.set(key, json);
    return;
  }
  await client().send(new PutObjectCommand({
    Bucket: env().R2_BUCKET, Key: key, Body: json, ContentType: "application/json; charset=utf-8",
  }));
}

export async function deleteReport(key: string): Promise<void> {
  if (DEV_SKIP_R2) {
    devStore.delete(key);
    return;
  }
  await client().send(new DeleteObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
}

export async function signedReportUrl(key: string, expiresSeconds = 300): Promise<string> {
  if (DEV_SKIP_R2) {
    const html = devStore.get(key) ?? DEV_PLACEHOLDER_HTML;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env().R2_BUCKET, Key: key }), { expiresIn: expiresSeconds });
}

/**
 * Download the JSON summary string for a given storage key.
 * Throws if the object does not exist or cannot be read.
 */
export async function getSummary(key: string): Promise<string> {
  if (DEV_SKIP_R2) {
    const json = devStore.get(key);
    if (!json) throw new Error(`[dev] summary not found in devStore: ${key}`);
    return json;
  }
  const res = await client().send(new GetObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
  const body = await res.Body?.transformToString();
  if (!body) throw new Error(`summary object empty or missing: ${key}`);
  return body;
}

export async function fetchSummaryJson(key: string): Promise<string | null> {
  if (DEV_SKIP_R2) {
    return devStore.get(key) ?? null;
  }
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
    return (await res.Body?.transformToString()) ?? null;
  } catch {
    return null;
  }
}

export function reportKey(auditId: string): string {
  return `reports/${auditId}.html`;
}

export function summaryKey(auditId: string): string {
  return `reports/${auditId}.json`;
}

const DEV_PLACEHOLDER_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Dev — report skipped</title>
<style>
  body { margin: 0; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; color: #e5e7eb; background: #111827; display: grid; place-items: center; min-height: 100vh; padding: 24px; }
  .card { max-width: 480px; border: 1px solid #374151; border-radius: 14px; padding: 24px; background: #1f2937; }
  code { background: #111827; padding: 2px 6px; border-radius: 4px; color: #a5b4fc; }
</style></head><body><div class="card">
  <h1 style="margin:0 0 8px;font-size:16px;letter-spacing:0.05em;text-transform:uppercase;color:#9ca3af">Dev mode</h1>
  <p style="margin:0 0 12px;font-size:18px;color:#f3f4f6">R2 upload skipped.</p>
  <p style="margin:0;color:#9ca3af">The audit ran and the native hero above still reads the structured summary from memory. To see the full HTML report locally, set real R2 credentials in <code>.env.local</code> and drop <code>DEV_SKIP_R2</code>, or deploy to production.</p>
</div></body></html>`;
