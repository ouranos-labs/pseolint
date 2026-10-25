import { describe, expect, test } from "vitest";
import { withBrowserProxy } from "../src/renderer.js";

describe("withBrowserProxy", () => {
  test("adds a Browserless launch param routing Chrome through the proxy, keeping the token", () => {
    const out = new URL(withBrowserProxy("ws://browserless:3000?token=abc", "http://egress-proxy:3128"));
    expect(out.searchParams.get("token")).toBe("abc");
    const launch = JSON.parse(out.searchParams.get("launch")!);
    expect(launch.args).toContain("--proxy-server=http://egress-proxy:3128");
    expect(launch.args).toContain("--proxy-bypass-list=<-loopback>");
  });
});
