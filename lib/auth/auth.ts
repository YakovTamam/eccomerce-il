import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

// Lazily built so `next build` doesn't need runtime secrets/DB.
let instance: ReturnType<typeof create> | undefined;

function create() {
  return betterAuth({
    baseURL: process.env.APP_URL,
    secret: process.env.AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    // Magic link is deferred until an email provider is chosen (MVP_SPEC §15.5).
    plugins: [nextCookies()],
  });
}

export function getAuth() {
  return (instance ??= create());
}
