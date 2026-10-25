"use client";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import {
  MAGIC_LINK_TTL_MINUTES,
  SIGNIN_ERROR_COPY,
  signinErrorUrl,
  type SigninErrorKind,
} from "@/lib/signin-callback";

const RESEND_COOLDOWN_S = 30;
// Remembered locally (never put in a URL) so an expired-link return can
// prefill the address. Storage can throw in private mode, hence the guards.
const EMAIL_KEY = "pseolint:signin-email";

function readStoredEmail(): string {
  try {
    return window.localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeEmail(email: string) {
  try {
    window.localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* storage unavailable: prefill is a convenience only */
  }
}

export default function SigninClient({
  callbackUrl,
  context,
  errorKind,
}: {
  callbackUrl: string;
  context: string | null;
  errorKind: SigninErrorKind | null;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  // Synchronous guard: state updates land a render late, so two fast clicks
  // could both pass a state check. The ref flips immediately.
  const inFlight = useRef(false);
  const { track } = useAnalytics();

  // Prefill after a bounced magic link so "send a new one" is one click.
  useEffect(() => {
    if (errorKind === "link") {
      const stored = readStoredEmail();
      if (stored) setEmail(stored);
    }
  }, [errorKind]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const busy = sending || redirecting;

  async function sendLink() {
    if (inFlight.current) return;
    inFlight.current = true;
    setEmailError(null);
    setSending(true);
    track({ name: "signin_started", props: { method: "magic_link" } });
    const { error: err } = await authClient.signIn.magicLink({
      email,
      callbackURL: callbackUrl,
      errorCallbackURL: signinErrorUrl("email", callbackUrl),
    });
    inFlight.current = false;
    setSending(false);
    if (err) {
      setEmailError(err.message ?? "We couldn't send your sign-in link. Try again.");
      setSent(false);
      return;
    }
    storeEmail(email);
    setSent(true);
    setCooldown(RESEND_COOLDOWN_S);
  }

  async function signInWithGoogle() {
    if (inFlight.current) return;
    inFlight.current = true;
    setGoogleError(null);
    setRedirecting(true);
    track({ name: "signin_started", props: { method: "google" } });
    const { error: err } = await authClient.signIn.social({
      provider: "google",
      callbackURL: callbackUrl,
      errorCallbackURL: signinErrorUrl("google", callbackUrl),
    });
    // On success the browser is already navigating away; keep the pending state.
    if (err) {
      inFlight.current = false;
      setRedirecting(false);
      setGoogleError(SIGNIN_ERROR_COPY.oauth);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md items-center px-5 py-16">
      <div className="w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {context ?? "Magic link or Google OAuth. No passwords."}
          </p>
        </div>

        {errorKind && !sent && (
          <p
            role="alert"
            className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {SIGNIN_ERROR_COPY[errorKind]}
          </p>
        )}

        <div className="rounded-[28px] border border-border bg-card p-6">
          {sent ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-success">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                sent
              </div>
              <p className="text-sm leading-relaxed text-foreground/90" aria-live="polite">
                Check your inbox; we sent a sign-in link to{" "}
                <span className="font-medium">{email}</span>.
              </p>
              <p className="text-xs text-muted-foreground">
                Link expires in {MAGIC_LINK_TTL_MINUTES} minutes. Not there? Check spam or promotions.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={busy || cooldown > 0}
                  onClick={sendLink}
                >
                  {sending ? "Sending…" : cooldown > 0 ? `Resend link (${cooldown}s)` : "Resend link"}
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1"
                  disabled={sending}
                  onClick={() => {
                    setSent(false);
                    setEmailError(null);
                    // Wait for the form to mount, then hand focus back.
                    window.setTimeout(() => emailRef.current?.focus(), 0);
                  }}
                >
                  Use a different email
                </Button>
              </div>
            </div>
          ) : (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendLink();
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    ref={emailRef}
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    aria-invalid={emailError ? true : undefined}
                    aria-describedby={emailError ? "email-error" : undefined}
                  />
                  {emailError && (
                    <p id="email-error" role="alert" className="text-sm text-destructive">
                      {emailError}
                    </p>
                  )}
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {sending ? "Sending…" : "Send magic link"}
                </Button>
              </form>

              <div className="relative my-5 flex items-center">
                <span className="flex-1 border-t border-border" />
                <span className="px-3 text-xs uppercase tracking-wider text-muted-foreground">
                  or
                </span>
                <span className="flex-1 border-t border-border" />
              </div>

              <Button variant="outline" className="w-full" disabled={busy} onClick={signInWithGoogle}>
                {redirecting ? "Redirecting to Google…" : "Continue with Google"}
              </Button>

              {googleError && (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {googleError}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
