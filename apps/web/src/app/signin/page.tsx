import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getOptionalSession } from "@/lib/session";
import SigninClient from "./signin-client";

export const metadata: Metadata = {
  title: "Sign in · pseolint",
  description:
    "Sign in to pseolint to monitor your domains, set alert thresholds, and get weekly audit digests.",
  robots: { index: false, follow: false },
  alternates: { canonical: `${env().BETTER_AUTH_URL}/signin` },
};

// Restrict callbackUrl to same-origin paths; reject protocol-relative ("//evil")
// and absolute URLs to prevent open-redirect abuse.
function safeCallback(raw: string | undefined): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await getOptionalSession();
  if (session) {
    const { callbackUrl } = await searchParams;
    redirect(safeCallback(callbackUrl));
  }
  return <SigninClient />;
}
