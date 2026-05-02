import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

function client(): S3Client {
  const e = env();
  return new S3Client({
    region: "auto",
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
  });
}

export async function uploadSummary(key: string, json: string): Promise<void> {
  await client().send(new PutObjectCommand({
    Bucket: env().R2_BUCKET, Key: key, Body: json, ContentType: "application/json; charset=utf-8",
  }));
}

export async function deleteReport(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
}

/**
 * Download the JSON summary string for a given storage key.
 * Throws if the object does not exist or cannot be read.
 */
export async function getSummary(key: string): Promise<string> {
  const res = await client().send(new GetObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
  const body = await res.Body?.transformToString();
  if (!body) throw new Error(`summary object empty or missing: ${key}`);
  return body;
}

export async function fetchSummaryJson(key: string): Promise<string | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
    return (await res.Body?.transformToString()) ?? null;
  } catch {
    return null;
  }
}

export function summaryKey(auditId: string): string {
  return `reports/${auditId}.json`;
}

/**
 * v0.5+: per-monitored-domain state file (RunState JSON) used by the
 * change-driven monitoring matrix. Persisted across Inngest invocations
 * because the worker filesystem is ephemeral on Vercel — without R2
 * persistence the matrix never sees prior state and refetches every URL.
 */
export function monitoringStateKey(monitoredDomainId: string): string {
  return `state/monitoring/${monitoredDomainId}.json`;
}

/** Upload arbitrary JSON to a key. Used by monitoring state. */
export async function uploadJson(key: string, json: string): Promise<void> {
  await client().send(new PutObjectCommand({
    Bucket: env().R2_BUCKET, Key: key, Body: json, ContentType: "application/json; charset=utf-8",
  }));
}

/**
 * Fetch arbitrary JSON; null if missing. Used by monitoring state — first
 * monitoring run for a domain has no prior state file and that's expected.
 */
export async function fetchJson(key: string): Promise<string | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
    return (await res.Body?.transformToString()) ?? null;
  } catch {
    return null;
  }
}

/** Delete arbitrary key. Used by monitoring state when a domain is removed. */
export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
}
