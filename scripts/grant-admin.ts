/**
 * Grants (or revokes) the platform-admin role. Run it yourself against the target database:
 *   pnpm admin:grant you@example.com          # grant
 *   pnpm admin:grant you@example.com --revoke
 * The role can't be granted from the app on purpose: there is no email verification yet, so an
 * email allow-list would let anyone who registers an admin's address first take over.
 */
import "dotenv/config";
import { Client } from "pg";

const [email, flag] = process.argv.slice(2);
if (!email || !email.includes("@")) {
  console.error("usage: pnpm admin:grant <email> [--revoke]");
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL(_UNPOOLED) is not set");
  process.exit(1);
}

const c = new Client({ connectionString: url });
await c.connect();
const role = flag === "--revoke" ? null : "admin";
const r = await c.query(
  "update users set platform_role = $2 where lower(email) = lower($1) returning id, name",
  [email, role],
);
await c.end();
if (!r.rowCount) {
  console.error(
    `No user with email ${email}. Sign up first, then run this again.`,
  );
  process.exit(2);
}
console.log(
  `${role ? "Granted platform admin to" : "Revoked platform admin from"} ${r.rows[0].name} <${email}>`,
);
