import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
let db: PGlite;
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
async function asUser(user: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`,
  );
}
async function mutate(operation: string, payload: unknown) {
  await db.query("select public.tracker_mutate($1,$2::jsonb)", [
    operation,
    JSON.stringify(payload),
  ]);
}
async function state() {
  const r = await db.query<{ d: Record<string, unknown[]> }>(
    "select public.tracker_data() as d",
  );
  return r.rows[0].d;
}
const foodPayload = {
  name: "テスト用架空食品（本番使用不可）",
  brand: "テスト",
  protein: 10,
  fat: 5,
  carbs: 20,
  kcal: 170,
  source_type: "estimated",
  source_ref: "Synthetic test fixture, not a real food",
  source_version: "test-v1",
  energy_basis: "テスト専用",
  portions: [{ label: "1パック", grams: 150 }],
};
let foodA: string, foodB: string, mealA: string, templateA: string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610260001_initial.sql", "utf8"),
  );
  await db.query("insert into auth.users(id) values ($1),($2)", [a, b]);
  await asUser(a);
  await mutate("food", foodPayload);
  foodA = (await db.query<{ id: string }>("select id from foods")).rows[0].id;
  await asUser(b);
  await mutate("food", { ...foodPayload, name: "別ユーザーの非公開食品" });
  foodB = (await db.query<{ id: string }>("select id from foods")).rows[0].id;
  await asUser(a);
});
afterAll(async () => {
  await db?.close();
});
describe("actual PostgreSQL migration, RLS and transactional RPCs", () => {
  it("creates eight RLS-enabled tables and default targets", async () => {
    const r = await db.query<{ n: number }>(
      "select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity",
    );
    expect(r.rows[0].n).toBe(8);
    const s = await state();
    expect(s.targets).toMatchObject([
      { protein_g: 107, fat_g: 70, carbs_g: 335, calories_kcal: 2400 },
    ]);
  });
  it("isolates food, portions and targets by authenticated user", async () => {
    expect((await state()).foods).toHaveLength(1);
    expect((await db.query("select * from food_portions")).rows).toHaveLength(
      1,
    );
    expect(
      (await db.query("select * from nutrition_targets where user_id=$1", [b]))
        .rows,
    ).toHaveLength(0);
  });
  it("rejects foreign private food references at the DB layer", async () => {
    await expect(
      mutate("favorite", { food_id: foodB, enabled: true }),
    ).rejects.toThrow();
    await expect(
      mutate("meal", {
        food_id: foodB,
        amount_g: 100,
        consumed_at: "2026-10-25T15:00:00Z",
        meal_type: "breakfast",
      }),
    ).rejects.toThrow();
    await expect(
      mutate("template", {
        name: "攻撃",
        items: [
          { food_id: foodA, amount_g: 100 },
          { food_id: foodB, amount_g: 100 },
        ],
      }),
    ).rejects.toThrow();
    expect((await state()).templates).toHaveLength(0);
  });
  it("rejects forged user ownership and private-to-shared promotion", async () => {
    await expect(
      db.query("insert into favorite_foods(user_id,food_id) values ($1,$2)", [
        b,
        foodA,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("update foods set owner_id=null where id=$1", [foodA]),
    ).rejects.toThrow();
    await expect(
      db.query("update foods set owner_id=$1 where id=$2", [b, foodA]),
    ).rejects.toThrow();
  });
  it("computes snapshots, registered portions and JST calendar date", async () => {
    await mutate("meal", {
      food_id: foodA,
      amount_g: 150,
      consumed_at: "2026-10-25T15:00:00Z",
      meal_type: "breakfast",
    });
    const meals = await db.query<{
      id: string;
      protein_g: number;
      calories_kcal: number;
      local_date: string;
    }>(
      "select *,protein_g::float8 as protein_g,calories_kcal::float8 as calories_kcal,local_date::text as local_date from meal_entries",
    );
    mealA = meals.rows[0].id;
    expect(meals.rows[0]).toMatchObject({
      protein_g: 15,
      calories_kcal: 255,
      local_date: "2026-10-26",
    });
  });
  it("preserves snapshots on food changes and datetime-only edits; recalculates intentional weight edits", async () => {
    await mutate("food", { ...foodPayload, id: foodA, protein: 50 });
    expect(
      (
        await db.query<{ protein_g: string }>(
          "select protein_g::float8 as protein_g from meal_entries",
        )
      ).rows[0].protein_g,
    ).toBe(15);
    await mutate("meal", {
      id: mealA,
      food_id: foodA,
      amount_g: 150,
      consumed_at: "2026-10-25T14:59:00Z",
      meal_type: "dinner",
    });
    expect(
      (
        await db.query(
          "select protein_g::float8 as protein_g,local_date::text as local_date from meal_entries",
        )
      ).rows[0],
    ).toMatchObject({ protein_g: 15, local_date: "2026-10-25" });
    await mutate("meal", {
      id: mealA,
      food_id: foodA,
      amount_g: 300,
      consumed_at: "2026-10-25T14:59:00Z",
      meal_type: "dinner",
    });
    expect(
      (
        await db.query(
          "select protein_g::float8 as protein_g from meal_entries",
        )
      ).rows[0],
    ).toMatchObject({ protein_g: 150 });
  });
  it("does not permit snapshot tampering through direct REST writes", async () => {
    await db.query(
      "update meal_entries set protein_g=999,local_date=$1 where id=$2",
      ["2000-01-01", mealA],
    );
    expect(
      (
        await db.query(
          "select protein_g::float8 as protein_g,local_date::text as local_date from meal_entries",
        )
      ).rows[0],
    ).toMatchObject({ protein_g: 150, local_date: "2026-10-25" });
  });
  it("applies date-effective targets independently from PFC", async () => {
    await mutate("target", {
      effective_from: "2026-10-26",
      protein: 120,
      fat: 0,
      carbs: 0,
      kcal: 2400,
    });
    const r = await db.query(
      "select protein_g,calories_kcal from nutrition_targets where effective_from<=$1 order by effective_from desc limit 1",
      ["2026-10-25"],
    );
    expect(r.rows[0]).toMatchObject({
      protein_g: "107",
      calories_kcal: "2400",
    });
    const s = await db.query(
      "select protein_g from nutrition_targets where effective_from<=$1 order by effective_from desc limit 1",
      ["2026-10-26"],
    );
    expect(s.rows[0]).toMatchObject({ protein_g: "120" });
  });
  it("saves and applies multiple template items atomically", async () => {
    await mutate("template", {
      name: "まとめて",
      items: [
        { food_id: foodA, amount_g: 100 },
        { food_id: foodA, amount_g: 300 },
      ],
    });
    templateA = (
      await db.query<{ id: string }>("select id from meal_templates")
    ).rows[0].id;
    await mutate("apply_template", {
      id: templateA,
      consumed_at: "2026-11-01T00:00:00+09:00",
      meal_type: "lunch",
    });
    expect(
      (
        await db.query(
          "select * from meal_entries where local_date='2026-11-01'",
        )
      ).rows,
    ).toHaveLength(2);
    const before = (
      await db.query(
        "select *,protein_g::float8 as protein_g,calories_kcal::float8 as calories_kcal,local_date::text as local_date from meal_entries",
      )
    ).rows.length;
    await expect(
      mutate("apply_template", {
        id: templateA,
        consumed_at: "2026-11-01T00:00:00+09:00",
        meal_type: "invalid",
      }),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "select *,protein_g::float8 as protein_g,calories_kcal::float8 as calories_kcal,local_date::text as local_date from meal_entries",
        )
      ).rows,
    ).toHaveLength(before);
  });
  it("denies another user meals, templates, portions and edits by arbitrary IDs", async () => {
    await asUser(b);
    expect((await state()).meals).toHaveLength(0);
    expect((await state()).templates).toHaveLength(0);
    await expect(
      mutate("apply_template", {
        id: templateA,
        consumed_at: "2026-10-26T12:00:00Z",
        meal_type: "lunch",
      }),
    ).rejects.toThrow();
    await expect(
      mutate("food", { ...foodPayload, id: foodA }),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into food_portions(food_id,label,grams) values($1,$2,100)",
        [foodA, "攻撃"],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into meal_template_items(template_id,food_id,amount_g) values($1,$2,100)",
        [templateA, foodB],
      ),
    ).rejects.toThrow();
    await mutate("delete_meal", { id: mealA });
    await asUser(a);
    expect(
      (await db.query("select * from meal_entries where id=$1", [mealA])).rows,
    ).toHaveLength(1);
  });
  it("permits shared reads but forbids shared mutations", async () => {
    await db.exec("reset role");
    const shared = (
      await db.query<{ id: string }>(
        "insert into foods(name,protein_100g,fat_100g,carbs_100g,kcal_100g,source_type,energy_basis) values('共有テスト',1,1,1,10,'estimated','テスト') returning id",
      )
    ).rows[0].id;
    await asUser(a);
    expect(
      (await db.query("select * from foods where id=$1", [shared])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("delete from foods where id=$1 returning id", [shared]))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "insert into food_portions(food_id,label,grams) values($1,$2,100)",
        [shared, "共有改ざん"],
      ),
    ).rejects.toThrow();
  });
  it("keeps history after food deletion and permits datetime-only edits", async () => {
    await mutate("delete_food", { id: foodA });
    const r = await db.query(
      "select food_id,protein_g::float8 as protein_g,food_name_snapshot from meal_entries where id=$1",
      [mealA],
    );
    expect(r.rows[0]).toMatchObject({
      food_id: null,
      protein_g: 150,
      food_name_snapshot: foodPayload.name,
    });
    await db.query(
      "update meal_entries set consumed_at='2027-01-01T00:00:00+09:00' where id=$1",
      [mealA],
    );
    expect(
      (
        await db.query(
          "select local_date::text as local_date from meal_entries where id=$1",
          [mealA],
        )
      ).rows[0],
    ).toMatchObject({ local_date: "2027-01-01" });
  });
  it("blocks anonymous table and RPC access", async () => {
    await db.exec("reset role;set role anon;");
    await expect(db.query("select * from foods")).rejects.toThrow();
    await expect(db.query("select tracker_data()")).rejects.toThrow();
    await expect(
      db.query("select tracker_mutate('delete_meal','{}')"),
    ).rejects.toThrow();
  });
});
