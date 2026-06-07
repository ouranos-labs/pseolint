import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { deliverMagicLink } from "@/lib/magic-link-delivery";
import { claimAnonAudits } from "@/lib/claim-anon-audits";

const e = env();

// Better Auth trusts only the baseURL origin by default, so a dev server that
// falls back to :3001 (when :3000 is taken) gets "Invalid origin" 403s. Trust
// the common localhost dev ports outside production; prod stays locked to
// BETTER_AUTH_URL.
const devTrustedOrigins =
  process.env.NODE_ENV === "production"
    ? undefined
    : ["http://localhost:3000", "http://localhost:3001"];

export const auth = betterAuth({
  baseURL: e.BETTER_AUTH_URL,
  ...(devTrustedOrigins ? { trustedOrigins: devTrustedOrigins } : {}),
  secret: e.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  socialProviders: e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } }
    : {},
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => { await deliverMagicLink(email, url); },
      expiresIn: 60 * 15,
    }),
  ],
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await claimAnonAudits(session.userId);
        },
      },
    },
  },
});
