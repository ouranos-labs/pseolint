import type { Metadata } from "next";
import { env } from "@/lib/env";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Sign in · pseolint",
  description: "Sign in to pseolint with a magic link or Google OAuth.",
  alternates: { canonical: `${SITE_URL}/signin` },
  robots: { index: false, follow: false },
};

export default function SigninLayout({ children }: { children: React.ReactNode }) {
  return children;
}
