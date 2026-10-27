import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
let db: PGlite;
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  c = "33333333-3333-4333-8333-333333333333",
  workspace = "44444444-4444-4444-8444-444444444444",
  proof = "a".repeat(64);
async function user(uid: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid}',false)`,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610270002_device_sync.sql", "utf8"),
  );
  await db.query("insert into auth.users values($1),($2),($3)", [a, b, c]);
});
afterAll(() => db.close());
describe("device synchronization RLS and compare-and-swap", () => {
  it("creates an isolated encrypted workspace and rejects direct writes", async () => {
    await user(a);
    const r = await db.query<{ d: { revision: number } }>(
      "select sync_create($1,$2,$3) d",
      [workspace, proof, "encrypted-a"],
    );
    expect(r.rows[0].d.revision).toBe(1);
    await expect(
      db.query("update sync_workspaces set encrypted_blob=$1", ["injected"]),
    ).rejects.toThrow();
  });
  it("requires a valid pairing proof even for another authenticated session", async () => {
    await user(b);
    expect((await db.query("select * from sync_workspaces")).rows).toHaveLength(
      0,
    );
    await expect(
      db.query("select sync_read($1)", [workspace]),
    ).rejects.toThrow();
    await expect(
      db.query("select sync_join($1,$2)", [workspace, "b".repeat(64)]),
    ).rejects.toThrow();
    await db.query("select sync_join($1,$2)", [workspace, proof]);
    expect((await db.query("select * from sync_workspaces")).rows).toHaveLength(
      1,
    );
  });
  it("prevents stale devices overwriting a newer revision", async () => {
    await user(b);
    const r = await db.query<{ d: { revision: number; conflict: boolean } }>(
      "select sync_write($1,1,$2) d",
      [workspace, "encrypted-b"],
    );
    expect(r.rows[0].d).toEqual({ revision: 2, conflict: false });
    await user(a);
    const stale = await db.query<{ d: { conflict: boolean } }>(
      "select sync_write($1,1,$2) d",
      [workspace, "stale"],
    );
    expect(stale.rows[0].d.conflict).toBe(true);
    expect(
      (
        await db.query<{ d: { blob: string } }>("select sync_read($1) d", [
          workspace,
        ])
      ).rows[0].d.blob,
    ).toBe("encrypted-b");
  });
  it("does not resend unchanged encrypted documents", async () => {
    await user(a);
    const r = await db.query<{ d: { blob: null; revision: number } }>(
      "select sync_read($1,2) d",
      [workspace],
    );
    expect(r.rows[0].d).toEqual({ revision: 2, blob: null });
  });
  it("denies unrelated device reads, writes, creation takeover and anonymous RPCs", async () => {
    await user(c);
    await expect(
      db.query("select sync_write($1,2,$2)", [workspace, "attacker"]),
    ).rejects.toThrow();
    await expect(
      db.query("select sync_create($1,$2,$3)", [workspace, proof, "attacker"]),
    ).rejects.toThrow();
    expect(
      (
        await db.query("select * from sync_members where workspace_id=$1", [
          workspace,
        ])
      ).rows,
    ).toHaveLength(0);
    await db.exec("reset role;set role anon;");
    await expect(
      db.query("select sync_join($1,$2)", [workspace, proof]),
    ).rejects.toThrow();
    await expect(db.query("select * from sync_workspaces")).rejects.toThrow();
  });
});
