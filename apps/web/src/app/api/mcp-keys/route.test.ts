import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getOptionalSession: vi.fn() }));
vi.mock("@/lib/mcp-keys", () => ({
  createMcpKey: vi.fn(),
  listMcpKeys: vi.fn(),
  revokeMcpKey: vi.fn(),
}));

import { getOptionalSession } from "@/lib/session";
import { createMcpKey, listMcpKeys, revokeMcpKey } from "@/lib/mcp-keys";
import { GET, POST, DELETE } from "./route";

const sess = vi.mocked(getOptionalSession);
const create = vi.mocked(createMcpKey);
const list = vi.mocked(listMcpKeys);
const revoke = vi.mocked(revokeMcpKey);

function jsonReq(method: string, body?: unknown): Request {
  return new Request("https://pseolint.dev/api/mcp-keys", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  sess.mockReset();
  create.mockReset();
  list.mockReset();
  revoke.mockReset();
  sess.mockResolvedValue({ user: { id: "user_123" } } as never);
});

describe("/api/mcp-keys", () => {
  it("401s when unauthenticated", async () => {
    sess.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
    expect((await POST(jsonReq("POST", { name: "x" }))).status).toBe(401);
  });

  it("POST creates a key and returns the plaintext token once", async () => {
    create.mockResolvedValue({ token: "pseo_secret", prefix: "secretpf" });
    const res = await POST(jsonReq("POST", { name: "My laptop" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ token: "pseo_secret", prefix: "secretpf" });
    expect(create).toHaveBeenCalledWith("user_123", "My laptop");
  });

  it("GET lists the caller's keys", async () => {
    list.mockResolvedValue([
      { id: "k1", name: "Laptop", prefix: "abcd1234", createdAt: new Date(0), lastUsedAt: null },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).keys).toHaveLength(1);
    expect(list).toHaveBeenCalledWith("user_123");
  });

  it("DELETE revokes a key scoped to the caller", async () => {
    const res = await DELETE(jsonReq("DELETE", { id: "k1" }));
    expect(res.status).toBe(200);
    expect(revoke).toHaveBeenCalledWith("user_123", "k1");
  });

  it("DELETE 400s without an id", async () => {
    expect((await DELETE(jsonReq("DELETE", {}))).status).toBe(400);
    expect(revoke).not.toHaveBeenCalled();
  });
});
