export default function Privacy() {
  return (
    <main className="container mx-auto max-w-2xl px-4 py-12 prose prose-sm max-w-none">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Effective 2026-04-19.</p>
      <h2 className="mt-8 text-xl font-semibold">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>Email, for authentication (magic link or Google OAuth).</li>
        <li>URLs you audit and the rendered HTML reports we generate.</li>
        <li>A SHA-256 hash of your IP (with a server-side salt) for rate limiting. We never store raw IPs.</li>
        <li>Subscription metadata (plan, Polar customer id). Billing data is held by Polar.sh (our merchant of record).</li>
      </ul>
      <h2 className="mt-8 text-xl font-semibold">How we use it</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>Run your audits.</li>
        <li>Show reports to you (and to the public, if you opt in).</li>
        <li>Rate-limit abuse.</li>
        <li>Send transactional email (magic links, audit completion).</li>
      </ul>
      <h2 className="mt-8 text-xl font-semibold">Data deletion</h2>
      <p className="mt-2 text-sm">Delete all your data via <code>DELETE /api/account</code> while signed in. Removes your user record, all audits, and stored reports.</p>
      <h2 className="mt-8 text-xl font-semibold">Third parties</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>Polar.sh — payments + VAT compliance</li>
        <li>Resend — transactional email</li>
        <li>Cloudflare — Turnstile, R2</li>
        <li>Neon — Postgres hosting</li>
        <li>Google — OAuth (only if selected)</li>
      </ul>
      <h2 className="mt-8 text-xl font-semibold">Contact</h2>
      <p className="mt-2 text-sm">philippe.kam27@gmail.com</p>
    </main>
  );
}
