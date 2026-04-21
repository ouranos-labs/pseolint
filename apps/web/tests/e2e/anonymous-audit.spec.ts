// apps/web/tests/e2e/anonymous-audit.spec.ts
import { test, expect } from "@playwright/test";

test.skip(!process.env.PLAYWRIGHT_E2E, "set PLAYWRIGHT_E2E=1 to run");

test("anonymous user can audit a URL", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("https://yoursite.com").fill("https://pseolint.dev");
  // In e2e env, TURNSTILE_SECRET_KEY must be set to 1x0000000000000000000000000000000AA (always-passes dev key).
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/a\//);
  await expect(page).toHaveURL(/\/r\//, { timeout: 180_000 });
});
