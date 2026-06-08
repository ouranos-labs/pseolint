import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mcp-auth", () => ({ resolveMcpIdentity: vi.fn() }));
vi.mock("@/lib/mcp-rate-limit", () => ({ checkMcpRateLimit: vi.fn() }));

import { resolveMcpIdentity } from "@/lib/mcp-auth";
import { checkMcpRateLimit } from "@/lib/mcp-rate-limit";
import { POST, GET, DELETE, OPTIONS } from "./route";

const auth = vi.mocked(resolveMcpIdentity);
const rl = vi.mocked(checkMcpRateLimit);

function mcpPost(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://pseolint.dev/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });
}

// A self-contained `initialize` request — valid stateless-mode entrypoint.
const initReq = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
};

describe("POST /api/mcp wrapper", () => {
  beforeEach(() => {
    auth.mockReset();
    rl.mockReset();
    auth.mockResolvedValue({ kind: "anon", ip: "203.0.113.7" });
    rl.mockResolvedValue({ success: true, retryAfterSeconds: 0 });
  });

  it("returns 401 for an invalid API key without calling the rate limiter", async () => {
    auth.mockResolvedValue({ kind: "invalid" });
    const res = await POST(mcpPost(initReq, { authorization: "Bearer pseo_bad" }));
    expect(res.status).toBe(401);
    expect(rl).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when rate limited", async () => {
    rl.mockResolvedValue({ success: false, retryAfterSeconds: 42 });
    const res = await POST(mcpPost(initReq));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
  });

  it("delegates a valid initialize request to mcp-handler", async () => {
    const res = await POST(mcpPost(initReq));
    expect(res.status).toBe(200);
    const text = await res.text();
    // mcp-handler may answer as JSON or an SSE frame; serverInfo appears either way.
    expect(text).toContain("protocolVersion");
    expect(text).toContain("pseolint");
  });

  it("fails CLOSED with 503 when identity resolution throws (DB down)", async () => {
    auth.mockRejectedValue(new Error("db down"));
    const res = await POST(mcpPost(initReq));
    expect(res.status).toBe(503);
    expect(rl).not.toHaveBeenCalled();
  });

  it("fails OPEN (delegates) when the rate-limit backend throws", async () => {
    rl.mockRejectedValue(new Error("redis down"));
    const res = await POST(mcpPost(initReq));
    expect(res.status).toBe(200); // delegated to mcp-handler despite limiter failure
  });
});

describe("method guards & CORS", () => {
  it("GET from a browser → 302 redirect to /mcp-server docs", () => {
    const res = GET(new Request("https://pseolint.dev/mcp", { headers: { accept: "text/html" } }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/mcp-server");
  });
  it("GET from a non-HTML caller → 405", () => {
    const res = GET(new Request("https://pseolint.dev/mcp", { headers: { accept: "application/json" } }));
    expect(res.status).toBe(405);
  });
  it("DELETE → 405", async () => {
    expect((await DELETE()).status).toBe(405);
  });
  it("OPTIONS → 204 with permissive CORS", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
