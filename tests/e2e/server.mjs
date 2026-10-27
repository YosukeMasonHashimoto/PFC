// Test-only Supabase contract adapter. Tokens are simulated; records stay encrypted.
import http from "node:http";
import { spawn } from "node:child_process";
import { createHmac, createHash, randomUUID } from "node:crypto";
const sessions = new Map(),
  workspaces = new Map();
function session() {
  const id = randomUUID(),
    head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    body = Buffer.from(
      JSON.stringify({
        sub: id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: "authenticated",
        aud: "authenticated",
      }),
    ).toString("base64url");
  const token = `${head}.${body}.${createHmac("sha256", "test-only").update(`${head}.${body}`).digest("base64url")}`;
  const user = {
    id,
    email: "",
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: true,
    app_metadata: { provider: "anonymous" },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
  };
  sessions.set(token, user);
  return {
    access_token: token,
    refresh_token: "test-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
}
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3100");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization,apikey,content-type,content-profile,accept-profile,prefer,x-client-info,x-supabase-api-version",
  );
  res.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  let text = "";
  for await (const part of req) text += part;
  const body = text ? JSON.parse(text) : {},
    url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/auth/v1/signup") {
    res.end(JSON.stringify(session()));
    return;
  }
  const user = sessions.get(
    (req.headers.authorization || "").replace(/^Bearer /, ""),
  );
  if (!user) {
    res.statusCode = 401;
    res.end(JSON.stringify({ message: "unauthorized" }));
    return;
  }
  if (url.pathname === "/auth/v1/user") {
    res.end(JSON.stringify(user));
    return;
  }
  const method = url.pathname.split("/").pop();
  let w = workspaces.get(body.workspace),
    result;
  const deny = () => {
    res.statusCode = 403;
    res.end(JSON.stringify({ code: "42501", message: "access denied" }));
  };
  if (method === "sync_create") {
    if (w && w.owner !== user.id) {
      deny();
      return;
    }
    if (!w) {
      w = {
        owner: user.id,
        proof: createHash("sha256").update(body.proof).digest("hex"),
        blob: body.blob,
        revision: 1,
        members: new Set([user.id]),
      };
      workspaces.set(body.workspace, w);
    }
  } else if (method === "sync_join") {
    if (
      !w ||
      w.proof !== createHash("sha256").update(body.proof).digest("hex")
    ) {
      deny();
      return;
    }
    w.members.add(user.id);
  } else if (!w?.members.has(user.id)) {
    deny();
    return;
  }
  if (method === "sync_write") {
    if (body.expected_revision !== w.revision)
      result = { conflict: true, revision: null };
    else {
      w.blob = body.blob;
      w.revision++;
      result = { conflict: false, revision: w.revision };
    }
  } else
    result = {
      blob:
        method === "sync_read" && body.known_revision === w.revision
          ? null
          : w.blob,
      revision: w.revision,
    };
  res.end(JSON.stringify(result));
});
await new Promise((resolve) => server.listen(54329, "127.0.0.1", resolve));
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  { stdio: "inherit", env: process.env },
);
const close = () => {
  child.kill("SIGTERM");
  server.close();
};
process.on("SIGTERM", close);
process.on("SIGINT", close);
child.on("exit", (code) => {
  server.close();
  process.exit(code ?? 0);
});
