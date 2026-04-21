import { z } from "zod";

/** Treat `KEY=` in .env as unset so `.optional()` and omitted keys behave correctly. */
function processEnvWithoutEmptyStrings(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(out)) {
    if (out[key] === "") delete out[key];
  }
  return out;
}

/** Non-critical infra keys we auto-fill with placeholders outside production so dev doesn't need a full .env.local. */
const DEV_FALLBACKS: Record<string, string> = {
  INNGEST_EVENT_KEY: "dev_placeholder",
  INNGEST_SIGNING_KEY: "signkey_dev_placeholder_32chars_xxxxxx",
  R2_ACCOUNT_ID: "dev_placeholder",
  R2_ACCESS_KEY_ID: "dev_placeholder",
  R2_SECRET_ACCESS_KEY: "dev_placeholder",
  R2_BUCKET: "pseolint-reports",
  POLAR_ACCESS_TOKEN: "polar_dev_placeholder",
  POLAR_WEBHOOK_SECRET: "polar_whsec_dev_placeholder",
  POLAR_MONTHLY_PRODUCT_ID: "price_monthly_dev_placeholder",
  POLAR_YEARLY_PRODUCT_ID: "price_yearly_dev_placeholder",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
};

function applyDevFallbacks(raw: Record<string, string | undefined>): Record<string, string | undefined> {
  if (raw.NODE_ENV === "production") return raw;
  const out = { ...raw };
  for (const [k, v] of Object.entries(DEV_FALLBACKS)) {
    if (out[k] === undefined) out[k] = v;
  }
  return out;
}

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().startsWith("re_"),
  RESEND_FROM: z.string().min(1),
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  POLAR_ACCESS_TOKEN: z.string().min(1),
  POLAR_WEBHOOK_SECRET: z.string().min(1),
  POLAR_MONTHLY_PRODUCT_ID: z.string().min(1),
  POLAR_YEARLY_PRODUCT_ID: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  IP_HASH_SALT: z.string().min(16),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(applyDevFallbacks(processEnvWithoutEmptyStrings()));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function __resetEnvCache(): void {
  cached = undefined;
}
