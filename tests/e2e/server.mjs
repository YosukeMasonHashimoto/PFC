// Test-only Supabase HTTP contract adapter backed by real embedded PostgreSQL.
// Auth is deliberately simulated. This does NOT validate hosted Supabase Auth.
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const uid = "11111111-1111-4111-8111-111111111111";
await db.exec(
  `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
);
await db.exec(
  readFileSync("supabase/migrations/202610260001_initial.sql", "utf8"),
);
await db.query("insert into auth.users values($1)", [uid]);
await db.exec(
  `set role authenticated;select set_config('request.jwt.claim.sub','${uid}',false)`,
);
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.invalid",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
};
function jwt() {
  const a = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  );
  const b = Buffer.from(
    JSON.stringify({
      sub: uid,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url");
  return `${a}.${b}.${createHmac("sha256", "local-test-only").update(`${a}.${b}`).digest("base64url")}`;
}
let queue = Promise.resolve();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  res.setHeader("Content-Type", "application/json");
  let text = "";
  for await (const part of req) text += part;
  const body = text ? JSON.parse(text) : {};
  if (
    url.pathname === "/auth/v1/token" &&
    url.searchParams.get("grant_type") === "pkce"
  ) {
    if (
      body.auth_code !== "test-pkce-code" ||
      typeof body.code_verifier !== "string" ||
      body.code_verifier.length < 32
    ) {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "invalid test verifier",
        }),
      );
      return;
    }
    res.end(
      JSON.stringify({
        access_token: jwt(),
        refresh_token: "test-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      }),
    );
    return;
  }
  if (url.pathname === "/auth/v1/verify") {
    res.end(
      JSON.stringify({
        access_token: jwt(),
        refresh_token: "test-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      }),
    );
    return;
  }
  if (url.pathname === "/auth/v1/user") {
    if (!req.headers.authorization) {
      res.statusCode = 401;
      res.end("{}");
      return;
    }
    res.end(JSON.stringify(user));
    return;
  }
  if (url.pathname === "/auth/v1/logout") {
    res.end("{}");
    return;
  }
  if (url.pathname === "/auth/v1/otp") {
    res.end("{}");
    return;
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    if (!req.headers.authorization) {
      res.statusCode = 401;
      res.end("{}");
      return;
    }
    // One shared PG connection: serialize requests to match individual transactions.
    queue = queue.then(async () => {
      try {
        if (url.pathname.endsWith("/tracker_data")) {
          const r = await db.query("select tracker_data() as d");
          res.end(JSON.stringify(r.rows[0].d));
        } else if (url.pathname.endsWith("/tracker_mutate")) {
          await db.query("select tracker_mutate($1,$2::jsonb)", [
            body.operation,
            JSON.stringify(body.payload),
          ]);
          res.end("null");
        } else {
          res.statusCode = 404;
          res.end("{}");
        }
      } catch (e) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({ code: e.code || "XX000", message: e.message }),
        );
      }
    });
    return;
  }
  res.statusCode = 404;
  res.end("{}");
});
await new Promise((resolve) => server.listen(54329, "127.0.0.1", resolve));
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-test-publishable",
      APP_URL: "http://127.0.0.1:3100",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
const close = () => {
  child.kill("SIGTERM");
  server.close();
  db.close().finally(() => process.exit(0));
};
process.on("SIGTERM", close);
process.on("SIGINT", close);
