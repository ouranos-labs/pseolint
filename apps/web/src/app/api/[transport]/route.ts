import { createMcpHandler } from "mcp-handler";
import { registerReadOnlyTools } from "@pseolint/mcp";
import { resolveMcpIdentity, type McpIdentity } from "@/lib/mcp-auth";
import { checkMcpRateLimit, type RateResult } from "@/lib/mcp-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel function timeout (mcp-handler's own maxDuration option is separate)

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
  let identity: McpIdentity;
  try {
    identity = await resolveMcpIdentity(req);
  } catch {
    // Identity backend (DB) unreachable → fail CLOSED. Never silently downgrade
    // to anonymous, which would bypass key validation.
    return jsonRpcError(503, "Service temporarily unavailable.", -32603);
  }

  if (identity.kind === "invalid") {
    return jsonRpcError(401, "Invalid or revoked API key.", -32001);
  }

  let limit: RateResult;
  try {
    limit = await checkMcpRateLimit(identity);
  } catch {
    // Rate-limit backend (Upstash) down → fail OPEN. This is a read-only public
    // surface; locking everyone out on a Redis blip is worse than not limiting.
    limit = { success: true, retryAfterSeconds: 0 };
  }

  if (!limit.success) {
    return jsonRpcError(429, "Rate limit exceeded. Slow down and retry.", -32002, {
      "retry-after": String(limit.retryAfterSeconds),
    });
  }

  try {
    return await mcpHandler(req);
  } catch {
    return jsonRpcError(500, "Internal error handling MCP request.", -32603);
  }
}

const methodNotAllowed = () =>
  new Response("Method Not Allowed. POST a JSON-RPC request to this Streamable HTTP endpoint.", {
    status: 405,
    headers: { allow: "POST, OPTIONS" },
  });

/**
 * MCP clients use POST (stateless Streamable HTTP). A GET almost always means a
 * human pasted the endpoint URL into a browser — send them to the human-facing
 * setup docs. Non-HTML callers (curl, probes) still get a 405.
 */
export function GET(req: Request): Response {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    // Relative Location → resolved against the request origin by the browser.
    // We never build the target from req.url's host, so there's no open-redirect
    // surface: the destination is always this site's /mcp-server.
    return new Response(null, { status: 302, headers: { location: "/mcp-server" } });
  }
  return methodNotAllowed();
}

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
