"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SigninPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="container mx-auto max-w-md px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Magic link or Google OAuth. No passwords.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <p className="text-sm text-muted-foreground">Check your email — we sent you a sign-in link (expires in 15 minutes).</p>
          ) : (
            <>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(null);
                  const { error: err } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
                  if (err) setError(err.message ?? "Failed to send link"); else setSent(true);
                }}
                className="space-y-3"
              >
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Button type="submit" className="w-full">Send magic link</Button>
              </form>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
              >
                Continue with Google
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
