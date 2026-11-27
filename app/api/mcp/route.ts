import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateRequest, originAllowed } from "@/lib/mcp/auth";
import { createMcpServer } from "@/lib/mcp/server";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 60;

/**
 * MCP over Streamable HTTP, stateless (one server + transport per request).
 * The store comes ONLY from the OAuth access token.
 */
export async function POST(req: Request) {
  if (!originAllowed(req))
    return Response.json({ error: "forbidden_origin" }, { status: 403 });
  const auth = await authenticateRequest(req);
  if ("response" in auth) return auth.response;
  if (!(await rateLimit(`mcp:${auth.ctx.grantId}:all`, 300, 60))) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const server = createMcpServer(auth.ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // the response body is already materialised (enableJsonResponse), safe to release
    queueMicrotask(() => void server.close().catch(() => {}));
  }
}

// Stateless server: no SSE stream to resume and no session to delete.
const notAllowed = () =>
  new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
export const GET = notAllowed;
export const DELETE = notAllowed;

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || !originAllowed(req))
    return new Response(null, { status: 204 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, content-type, mcp-protocol-version, mcp-session-id, accept",
      "Access-Control-Expose-Headers": "WWW-Authenticate",
      Vary: "Origin",
    },
  });
}
