import { oauthJson, oauthPreflight } from "@/lib/oauth/http";
import { revokeToken } from "@/lib/oauth/service";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/** RFC 7009: always 200, whether or not the token existed. */
export async function POST(req: Request) {
  if (!(await rateLimit(`oauth:revoke:${clientIp(req)}`, 60, 60)))
    return oauthJson({ error: "rate_limited" }, 429);
  const token = new URLSearchParams(await req.text()).get("token");
  if (token) await revokeToken(token);
  return oauthJson({});
}
export const OPTIONS = oauthPreflight;
