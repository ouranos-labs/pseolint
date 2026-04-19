import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { sendMagicLinkEmail } from "@/lib/resend";

const e = env();

export const auth = betterAuth({
  baseURL: e.BETTER_AUTH_URL,
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
      sendMagicLink: async ({ email, url }) => { await sendMagicLinkEmail(email, url); },
      expiresIn: 60 * 15,
    }),
  ],
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
});
