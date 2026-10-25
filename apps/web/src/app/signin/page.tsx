import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import {
  callbackContext,
  classifySigninError,
  hasExplicitCallback,
  resolveCallbackUrl,
} from "@/lib/signin-callback";
import SigninClient from "./signin-client";

export const metadata: Metadata = {
  title: "Sign in · pseolint",
  description:
    "Sign in to pseolint to monitor your domains, set alert thresholds, and get weekly audit digests.",
  // noindex only: deliberately no rel=canonical. Combining noindex with a
  // canonical sends Google contradictory signals, and auth-gated routes
  // (/dashboard/*) redirect here, so a crawler that follows the redirect would
  // otherwise see "noindex but canonicalizes to /signin" (tech/canonical-noindex-conflict).
  robots: { index: false, follow: false },
};

type Params = {
  callbackUrl?: string | string[];
  next?: string | string[];
  error?: string | string[];
  method?: string | string[];
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SigninPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  // `callbackUrl` is canonical; `next` is a legacy alias. Sanitized to a
  // same-origin relative path (open-redirect guard), defaulting to /dashboard.
  const callbackUrl = resolveCallbackUrl(params);

  const session = await getOptionalSession();
  if (session) redirect(callbackUrl);

  return (
    <SigninClient
      callbackUrl={callbackUrl}
      context={hasExplicitCallback(params) ? callbackContext(callbackUrl) : null}
      errorKind={classifySigninError(first(params.error), first(params.method))}
    />
  );
}
