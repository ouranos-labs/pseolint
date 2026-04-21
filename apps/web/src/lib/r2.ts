import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

function client(): S3Client {
  const e = env();
  return new S3Client({
    region: "auto",
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
  });
}

export async function uploadReport(key: string, html: string): Promise<void> {
  await client().send(new PutObjectCommand({
    Bucket: env().R2_BUCKET, Key: key, Body: html, ContentType: "text/html; charset=utf-8",
  }));
}

export async function uploadSummary(key: string, json: string): Promise<void> {
  await client().send(new PutObjectCommand({
    Bucket: env().R2_BUCKET, Key: key, Body: json, ContentType: "application/json; charset=utf-8",
  }));
}

export async function deleteReport(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
}

export async function signedReportUrl(key: string, expiresSeconds = 300): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env().R2_BUCKET, Key: key }), { expiresIn: expiresSeconds });
}

export async function fetchSummaryJson(key: string): Promise<string | null> {
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
