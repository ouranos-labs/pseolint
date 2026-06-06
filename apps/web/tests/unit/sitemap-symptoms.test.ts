import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { MARKETING_SYMPTOMS } from "@/lib/marketing-symptoms";

describe("sitemap symptom coverage", () => {
  it("emits a URL for every marketing symptom", () => {
    const urls = sitemap().map((e) => e.url);
    for (const s of MARKETING_SYMPTOMS) {
      expect(urls.some((u) => u.endsWith(`/symptoms/${s.slug}`))).toBe(true);
    }
  });
});
