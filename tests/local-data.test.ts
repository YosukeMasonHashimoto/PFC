import { describe, it, expect } from "vitest";
import {
  initialData,
  applyMutation,
  encodeBackup,
  decodeBackup,
  validateData,
} from "../src/lib/local-data";
const food = {
  name: "架空テスト食品",
  brand: "テスト専用",
  protein: 10,
  fat: 5,
  carbs: 20,
  kcal: 170,
  source_type: "estimated",
  source_ref: "Synthetic test data",
  source_version: "test",
  energy_basis: "テスト専用",
  portions: [{ label: "1パック", grams: 150 }],
};
function fixture() {
  return applyMutation(initialData(), "food", food);
}
function meal(state: ReturnType<typeof fixture>, amount_g = 150) {
  return applyMutation(state, "meal", {
    food_id: state.foods[0].id,
    amount_g,
    consumed_at: "2026-10-25T15:00:00Z",
    meal_type: "breakfast",
  });
}
describe("local data and backups", () => {
  it("initializes independent browser identities and target history", () => {
    const a = initialData(),
      b = initialData();
    expect(a.user_id).not.toBe(b.user_id);
    expect(a.targets[0]).toMatchObject({
      protein_g: 107,
      fat_g: 70,
      carbs_g: 335,
      calories_kcal: 2400,
    });
  });
  it("creates foods and registered portions with persistent owner identity", () => {
    const d = fixture();
    expect(d.foods[0].owner_id).toBe(d.user_id);
    expect(d.foods[0].portions[0].grams).toBe(150);
  });
  it("calculates snapshots and calendar dates", () => {
    const d = meal(fixture());
    expect(d.meals[0]).toMatchObject({
      protein_g: 15,
      fat_g: 7.5,
      carbs_g: 30,
      calories_kcal: 255,
      local_date: "2026-10-26",
    });
  });
  it("keeps snapshots after master edits and datetime-only edits", () => {
    let d = meal(fixture());
    d = applyMutation(d, "food", { ...food, id: d.foods[0].id, protein: 50 });
    const m = d.meals[0];
    d = applyMutation(d, "meal", {
      id: m.id,
      food_id: m.food_id,
      amount_g: 150,
      consumed_at: "2026-10-25T14:59:00Z",
      meal_type: "dinner",
    });
    expect(d.meals[0]).toMatchObject({
      protein_g: 15,
      local_date: "2026-10-25",
    });
    d = applyMutation(d, "meal", {
      id: m.id,
      food_id: m.food_id,
      amount_g: 300,
      consumed_at: m.consumed_at,
      meal_type: "dinner",
    });
    expect(d.meals[0].protein_g).toBe(150);
  });
  it("preserves deleted-food history, allows datetime edits and cleans references", () => {
    let d = meal(fixture());
    const id = d.foods[0].id;
    d = applyMutation(d, "favorite", { food_id: id, enabled: true });
    d = applyMutation(d, "template", {
      name: "テスト",
      items: [{ food_id: id, amount_g: 100 }],
    });
    d = applyMutation(d, "delete_food", { id });
    expect(d.meals[0]).toMatchObject({ food_id: null, protein_g: 15 });
    expect(d.favorites).toEqual([]);
    expect(d.templates[0].items).toEqual([]);
    d = applyMutation(d, "meal", {
      id: d.meals[0].id,
      food_id: null,
      amount_g: 150,
      consumed_at: "2027-01-01T00:00:00+09:00",
      meal_type: "snack",
    });
    expect(d.meals[0]).toMatchObject({
      protein_g: 15,
      local_date: "2027-01-01",
    });
    expect(() =>
      applyMutation(d, "apply_template", {
        id: d.templates[0].id,
        consumed_at: d.meals[0].consumed_at,
        meal_type: "lunch",
      }),
    ).toThrow();
    expect(decodeBackup(encodeBackup(d)).meals).toEqual(d.meals);
  });
  it("creates and applies templates atomically without mutating the input", () => {
    const d = fixture(),
      id = d.foods[0].id;
    expect(() =>
      applyMutation(d, "template", {
        name: "invalid",
        items: [
          { food_id: id, amount_g: 100 },
          { food_id: crypto.randomUUID(), amount_g: 100 },
        ],
      }),
    ).toThrow();
    expect(d.templates).toEqual([]);
    const saved = applyMutation(d, "template", {
      name: "test",
      items: [
        { food_id: id, amount_g: 100 },
        { food_id: id, amount_g: 300 },
      ],
    });
    const result = applyMutation(saved, "apply_template", {
      id: saved.templates[0].id,
      consumed_at: "2026-10-26T12:00:00+09:00",
      meal_type: "lunch",
    });
    expect(result.meals).toHaveLength(2);
    expect(saved.meals).toHaveLength(0);
  });
  it("upserts a target date while preserving previous targets", () => {
    let d = fixture();
    const payload = {
      effective_from: "2026-10-26",
      protein: 120,
      fat: 0,
      carbs: 0,
      kcal: 2400,
    };
    d = applyMutation(d, "target", payload);
    d = applyMutation(d, "target", { ...payload, protein: 130 });
    expect(d.targets).toHaveLength(2);
    expect(d.targets[0].protein_g).toBe(130);
  });
  it("round-trips full records through a versioned backup", () => {
    let d = meal(fixture());
    d = applyMutation(d, "favorite", { food_id: d.foods[0].id, enabled: true });
    d = applyMutation(d, "template", {
      name: "test",
      items: [{ food_id: d.foods[0].id, amount_g: 100 }],
    });
    expect(decodeBackup(encodeBackup(d))).toEqual(d);
  });
  it("rejects malformed and unsupported backups", () => {
    expect(() => decodeBackup("not JSON")).toThrow();
    expect(() =>
      decodeBackup(
        JSON.stringify({ format: "pfc-tracker", version: 99, data: fixture() }),
      ),
    ).toThrow();
  });
  it("rejects duplicate IDs and dangling references without replacing input", () => {
    const d = meal(fixture());
    const broken = structuredClone(d);
    broken.foods = [];
    expect(() => validateData(broken)).toThrow();
    const dup = structuredClone(d);
    dup.foods.push(dup.foods[0]);
    expect(() => validateData(dup)).toThrow();
    expect(d.foods).toHaveLength(1);
  });
  it("rejects non-finite nutrients, inconsistent dates and negative amounts", () => {
    const d = meal(fixture());
    for (const protein_g of [NaN, Infinity, -1])
      expect(() =>
        validateData({ ...d, meals: [{ ...d.meals[0], protein_g }] }),
      ).toThrow();
    expect(() =>
      validateData({
        ...d,
        meals: [{ ...d.meals[0], local_date: "2026-10-25" }],
      }),
    ).toThrow();
    expect(() =>
      applyMutation(d, "meal", {
        food_id: d.foods[0].id,
        amount_g: 0,
        consumed_at: d.meals[0].consumed_at,
        meal_type: "breakfast",
      }),
    ).toThrow();
  });
  it("deletes meals, favorites and templates", () => {
    let d = meal(fixture());
    const id = d.foods[0].id;
    d = applyMutation(d, "favorite", { food_id: id, enabled: true });
    d = applyMutation(d, "favorite", { food_id: id, enabled: false });
    expect(d.favorites).toEqual([]);
    d = applyMutation(d, "template", {
      name: "test",
      items: [{ food_id: id, amount_g: 100 }],
    });
    d = applyMutation(d, "delete_template", { id: d.templates[0].id });
    expect(d.templates).toEqual([]);
    d = applyMutation(d, "delete_meal", { id: d.meals[0].id });
    expect(d.meals).toEqual([]);
  });
});
