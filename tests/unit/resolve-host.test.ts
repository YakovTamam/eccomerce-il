import { describe, expect, it } from "vitest";
import { normalizeHost, resolveHost } from "@/lib/tenancy/resolve-host";
import { slugSchema } from "@/lib/tenancy/slug";

const ROOTS = ["xn--4dbklvp7aj.xn--4dbrk0ce", "ecomm-il.co.il", "localhost"];
const R = (h: string) => resolveHost(h, ROOTS);

describe("resolveHost", () => {
  it("serves the platform on root domains", () => {
    expect(R("xn--4dbklvp7aj.xn--4dbrk0ce")).toEqual({ kind: "platform" });
    expect(R("localhost:3000")).toEqual({ kind: "platform" });
    expect(R("www.ecomm-il.co.il")).toEqual({ kind: "platform" });
  });
  it("normalizes IDN to punycode", () => {
    expect(normalizeHost("איקומרס.ישראל")).toBe("xn--4dbklvp7aj.xn--4dbrk0ce");
    expect(R("איקומרס.ישראל")).toEqual({ kind: "platform" });
    expect(R("Pizza.איקומרס.ישראל:443")).toEqual({
      kind: "store",
      slug: "pizza",
    });
  });
  it("maps app. and <slug>. subdomains, incl. localhost for dev", () => {
    expect(R("app.localhost:3000")).toEqual({ kind: "app" });
    expect(R("a.localhost:3000")).toEqual({ kind: "store", slug: "a" });
    expect(R("b.localhost:3000")).toEqual({ kind: "store", slug: "b" });
    expect(R("APP.ecomm-il.co.il")).toEqual({ kind: "app" });
  });
  it("rejects nested or malformed subdomains", () => {
    expect(R("x.y.localhost")).toEqual({ kind: "notfound" });
    expect(R("")).toEqual({ kind: "notfound" });
  });
  it("treats unknown hosts as custom domains, vercel previews as platform", () => {
    expect(R("shop.example.com")).toEqual({
      kind: "custom",
      hostname: "shop.example.com",
    });
    expect(R("eccomerce-il-git-x.vercel.app")).toEqual({ kind: "platform" });
    expect(R("127.0.0.1:3000")).toEqual({ kind: "platform" });
  });
});

describe("slugSchema", () => {
  it("accepts valid slugs", () => {
    expect(slugSchema.parse(" Pizza-1 ")).toBe("pizza-1");
  });
  it.each(["ab", "-abc", "abc-", "אבג", "a_b_c", "a.b.c", "app", "www"])(
    "rejects %s",
    (s) => {
      expect(slugSchema.safeParse(s).success).toBe(false);
    },
  );
});
