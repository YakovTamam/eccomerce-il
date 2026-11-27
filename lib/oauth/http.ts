import { OAuthError } from "./service";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

export const oauthJson = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) => Response.json(body, { status, headers: { ...CORS, ...extra } });
export const oauthPreflight = () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization",
    },
  });

export function oauthErrorResponse(e: unknown) {
  if (e instanceof OAuthError) {
    const status = e.code === "invalid_client" ? 401 : 400;
    return oauthJson(
      {
        error: e.code,
        error_description: e.message === e.code ? undefined : e.message,
      },
      status,
    );
  }
  console.error("oauth endpoint failed", e);
  return oauthJson({ error: "server_error" }, 500);
}
