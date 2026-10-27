// Isolate browser tests from real Supabase credentials and production records.
import { spawnSync } from "node:child_process";
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pfc-test-public-key",
};
for (const args of [
  ["node_modules/next/dist/bin/next", "build"],
  ["scripts/build-pwa.mjs"],
  ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
