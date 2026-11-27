import { authenticateAccessToken, type McpAuth } from "@/lib/oauth/service";
import { oauthUrls } from "@/lib/oauth/config";

export function unauthorized(error?: "invalid_token") {
  const u = oauthUrls();
  const params = [
    `resource_metadata="${u.resourceMetadata}"`,
    ...(error ? [`error="${error}"`] : []),
  ].join(", ");
  return Response.json(
    {
      error: error ?? "unauthorized",
      error_description: "Bearer token required",
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer ${params}`,
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function authenticateRequest(
  req: Request,
): Promise<{ ctx: McpAuth } | { response: Response }> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) return { response: unauthorized() };
  const ctx = await authenticateAccessToken(m[1]);
  return ctx ? { ctx } : { response: unauthorized("invalid_token") };
}

/** DNS-rebinding / cross-site guard (MCP spec): browsers send Origin; only our own and known Claude origins are accepted. */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // server-to-server clients (Claude connectors) send none
  const extra = (process.env.MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = new Set([
    oauthUrls().issuer,
    "https://claude.ai",
    "https://claude.com",
    ...extra,
  ]);
  if (allowed.has(origin)) return true;
  try {
    const u = new URL(origin);
    return (
      u.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    );
  } catch {
    return false;
  }
}
