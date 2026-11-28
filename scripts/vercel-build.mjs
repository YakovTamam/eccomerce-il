/**
 * Vercel build: run DB migrations only when a database is configured, then build the app.
 * - Database configured (DATABASE_URL_UNPOOLED or DATABASE_URL): migrations run, and a failed migration FAILS the build
 *   (we never ship code against a half-migrated schema).
 * - No database configured: warn loudly and continue, so the static marketing page can still deploy
 *   (dashboard/stores will report a clear "DATABASE_URL is not set" error until it is configured).
 */
import { spawnSync } from "node:child_process";

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (url) {
  console.log("[vercel-build] database configured: running migrations");
  run("pnpm", ["db:migrate"]);
} else {
  console.warn(
    "\n[vercel-build] ⚠ DATABASE_URL_UNPOOLED / DATABASE_URL are NOT set for this build environment.",
  );
  console.warn(
    "[vercel-build]   Skipping migrations. The landing page will work; sign-up, dashboard and stores will not until you",
  );
  console.warn(
    "[vercel-build]   add the variables in Vercel → Settings → Environment Variables (Production AND Preview) and redeploy.\n",
  );
}
run("pnpm", ["exec", "next", "build"]);
