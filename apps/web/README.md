# @pseolint/web

Next.js app hosting the pseolint SaaS at `app.pseolint.dev`.

## Stack

- Next.js 15 (App Router), React 19
- Tailwind v4 + shadcn/ui + Geist + Geist Mono
- Neon Postgres + Drizzle ORM
- Better Auth (magic-link via Resend, Google OAuth)
- Inngest (durable audit worker on Vercel serverless)
- Cloudflare R2 (report storage, rendered via sandboxed iframe)
- Cloudflare Turnstile (bot gate)
- Polar.sh (payments, merchant-of-record)

## Dev setup

```bash
bun install
cp apps/web/.env.example apps/web/.env.local   # fill real values

docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=local --name pseolint-pg postgres:16
cd apps/web
DATABASE_URL=postgresql://postgres:local@localhost:5432/postgres bun x drizzle-kit push

bun --cwd apps/web run dev
```

## Deploy

1. Vercel: deploy from repo root, output dir `apps/web/.next`.
2. Neon: provision Postgres, set `DATABASE_URL` with `sslmode=require`.
3. R2: create bucket `pseolint-reports`, create an S3 API token (read+write), disable public bucket browsing.
4. Polar: create products (monthly + yearly), set webhook URL `https://app.pseolint.dev/api/webhooks/polar`.
5. Inngest: link the app, copy `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`.
6. Turnstile: create a widget for `app.pseolint.dev`.
7. Resend: verify `pseolint.dev` domain, copy API key.
8. Google OAuth (optional): create OAuth client, authorize `https://app.pseolint.dev/api/auth/callback/google`.
