import { createMcpHandler } from "mcp-handler";
import { registerReadOnlyTools } from "@pseolint/mcp";
import { resolveMcpIdentity } from "@/lib/mcp-auth";
import { checkMcpRateLimit } from "@/lib/mcp-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => {
    registerReadOnlyTools(server);
  },
  { serverInfo: { name: "pseolint", version: "remote" } },
  { basePath: "/api", maxDuration: 60, disableSse: true, verboseLogs: false },
);

/** JSON-RPC-shaped error body so MCP clients surface auth/limit failures cleanly. */
function jsonRpcError(status: number, message: string, code: number, headers?: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
    { status, headers: { "content-type": "application/json", "x-content-type-options": "nosniff", ...headers } },
  );
}

export async function POST(req: Request): Promise<Response> {
  const identity = await resolveMcpIdentity(req);
  if (identity.kind === "invalid") {
    return jsonRpcError(401, "Invalid or revoked API key.", -32001);
  }

  const limit = await checkMcpRateLimit(identity);
  if (!limit.success) {
    return jsonRpcError(429, "Rate limit exceeded. Slow down and retry.", -32002, {
      "retry-after": String(limit.retryAfterSeconds),
    });
  }

  return mcpHandler(req);
}

const methodNotAllowed = () =>
  new Response("Method Not Allowed. POST a JSON-RPC request to this Streamable HTTP endpoint.", {
    status: 405,
    headers: { allow: "POST, OPTIONS" },
  });

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;

/** Permissive CORS preflight — the endpoint is an unauthenticated, read-only public surface. */
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
      "access-control-max-age": "86400",
    },
  });
}
