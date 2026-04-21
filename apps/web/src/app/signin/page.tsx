"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SigninPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-md items-center px-5 py-16">
      <div className="w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Magic link or Google OAuth. No passwords.
          </p>
        </div>

        <div className="rounded-[28px] border border-border bg-card p-6">
          {sent ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-success">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                sent
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">
                Check your inbox — we sent a sign-in link to{" "}
                <span className="font-medium">{email}</span>.
              </p>
              <p className="text-xs text-muted-foreground">Link expires in 15 minutes.</p>
            </div>
          ) : (
            <>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(null);
                  setSubmitting(true);
                  const { error: err } = await authClient.signIn.magicLink({
                    email,
                    callbackURL: "/dashboard",
                  });
                  if (err) {
                    setError(err.message ?? "Failed to send link");
                    setSubmitting(false);
                  } else {
                    setSent(true);
                  }
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                  />
                </div>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Sending…" : "Send magic link"}
                </Button>
              </form>

              <div className="relative my-5 flex items-center">
                <span className="flex-1 border-t border-border" />
                <span className="px-3 text-xs uppercase tracking-wider text-muted-foreground">
                  or
                </span>
                <span className="flex-1 border-t border-border" />
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })
                }
              >
                Continue with Google
              </Button>

              {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
