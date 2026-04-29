import type { Metadata } from "next";
import { env } from "@/lib/env";
import SigninClient from "./signin-client";

export const metadata: Metadata = {
  title: "Sign in · pseolint",
  description:
    "Sign in to pseolint to monitor your domains, set alert thresholds, and get weekly audit digests.",
  robots: { index: false, follow: false },
  alternates: { canonical: `${env().BETTER_AUTH_URL}/signin` },
};

export default function SigninPage() {
  return <SigninClient />;
}
