import { NextResponse, type NextRequest } from "next/server";
import { getRootDomains, resolveHost } from "@/lib/tenancy/resolve-host";

// Paths that must never be rewritten: Next internals, API routes, well-known, static files.
const PASSTHROUGH =
  /^\/(?:_next\/|api\/|\.well-known\/|favicon\.ico$|robots\.txt$)/;
// Internal route trees reachable only through our rewrites, never directly.
const INTERNAL = /^\/(?:_store|_dashboard|_preview)(?:\/|$)/;

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";

  if (INTERNAL.test(pathname))
    return new NextResponse("Not found", { status: 404 });
  if (PASSTHROUGH.test(pathname)) return NextResponse.next();

  const target = resolveHost(host, getRootDomains());
  const rewrite = (prefix: string) => {
    const url = req.nextUrl.clone();
    url.pathname = `${prefix}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  };

  switch (target.kind) {
    case "platform":
      return NextResponse.next();
    case "app":
      return rewrite("/_dashboard");
    case "store":
      return rewrite(`/_store/${target.slug}`);
    case "custom":
      return rewrite(`/_store/${encodeURIComponent(target.hostname)}`);
    case "notfound":
      return new NextResponse("Not found", { status: 404 });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
