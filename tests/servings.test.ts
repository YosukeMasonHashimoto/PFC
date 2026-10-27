import { describe, it, expect } from "vitest";
import {
  applyMutation,
  initialData,
  validateData,
  encodeBackup,
  decodeBackup,
} from "../src/lib/local-data";
import { calculateFood, per100g, formatAmount } from "../src/lib/nutrition";
import { recommend, project } from "../src/lib/recommend";
import { mergeData } from "../src/lib/sync-model";
import { newSyncCode, encryptSync, decryptSync } from "../src/lib/sync-crypto";
import type { ServingUnit } from "../src/lib/types";
const nutrients = { protein: 20, fat: 15, carbs: 90, kcal: 600 };
const metadata = {
  name: "架空の牛丼（並盛）",
  brand: "",
  source_type: "manual",
  source_ref: "テスト用",
  source_version: "",
  energy_basis: "test",
  portions: [],
};
function payload(unit: ServingUnit = "杯", grams?: number) {
  return {
    ...metadata,
    ...(grams
      ? per100g(nutrients, grams)
      : { protein: 0, fat: 0, carbs: 0, kcal: 0 }),
    serving: { unit, ...nutrients, ...(grams ? { grams } : {}) },
  };
}
function fixture(unit: ServingUnit = "杯", grams?: number) {
  return applyMutation(initialData(), "food", payload(unit, grams));
}
const mealInput = { consumed_at: "2026-10-28T03:00:00Z", meal_type: "lunch" };
describe("food serving units without invented weights", () => {
  it.each(["食", "個", "杯"] as const)(
    "records one and half a %s without grams",
    (unit) => {
      const d = fixture(unit),
        food = d.foods[0];
      expect(food.serving?.grams).toBeUndefined();
      expect(food.kcal_100g).toBeNull();
      expect(calculateFood(food, { serving: { quantity: 1, unit } }).kcal).toBe(
        "600",
      );
      const saved = applyMutation(d, "meal", {
        food_id: food.id,
        ...mealInput,
        serving: { quantity: 0.5, unit },
      });
      expect(saved.meals[0]).toMatchObject({
        serving: { quantity: 0.5, unit },
        protein_g: 10,
        fat_g: 7.5,
        carbs_g: 45,
        calories_kcal: 300,
      });
      expect(saved.meals[0].amount_g).toBeUndefined();
      expect(formatAmount(saved.meals[0])).toBe(`0.5${unit}`);
      expect(validateData(saved)).toEqual(saved);
      expect(() => calculateFood(food, { amount_g: 100 })).toThrow();
    },
  );
  it("supports both known grams and a named serving with the same energy", () => {
    const d = fixture("個", 150),
      food = d.foods[0];
    expect(calculateFood(food, { amount_g: 150 })).toEqual(
      calculateFood(food, { serving: { unit: "個", quantity: 1 } }),
    );
    expect(calculateFood(food, { amount_g: 75 }).kcal).toBe("300");
    expect(() =>
      applyMutation(initialData(), "food", {
        ...payload("個", 150),
        kcal: 600,
      }),
    ).toThrow();
    const invalid = structuredClone(d);
    invalid.foods[0].kcal_100g = 999;
    expect(() => validateData(invalid)).toThrow();
  });
  it("rejects ambiguous, missing, invalid quantities and incompatible units", () => {
    const d = fixture();
    const input = { food_id: d.foods[0].id, ...mealInput };
    for (const quantity of [0, -1, "", null, Infinity, 100001])
      expect(() =>
        applyMutation(d, "meal", {
          ...input,
          serving: { quantity, unit: "杯" },
        }),
      ).toThrow();
    expect(() => applyMutation(d, "meal", input)).toThrow();
    expect(() =>
      applyMutation(d, "meal", {
        ...input,
        amount_g: 100,
        serving: { quantity: 1, unit: "杯" },
      }),
    ).toThrow();
    expect(() =>
      applyMutation(d, "meal", {
        ...input,
        serving: { quantity: 1, unit: "個" },
      }),
    ).toThrow();
    expect(() =>
      applyMutation(d, "meal", { ...input, amount_g: 100 }),
    ).toThrow();
  });
  it("preserves historical serving snapshots after edits and deletion", () => {
    let d = fixture();
    const id = d.foods[0].id;
    d = applyMutation(d, "meal", {
      food_id: id,
      ...mealInput,
      serving: { quantity: 1, unit: "杯" },
    });
    const recorded = d.meals[0];
    d = applyMutation(d, "food", { ...payload("個"), id });
    d = applyMutation(d, "meal", {
      ...recorded,
      consumed_at: "2026-10-27T03:00:00Z",
    });
    expect(d.meals[0]).toMatchObject({
      serving: { quantity: 1, unit: "杯" },
      calories_kcal: 600,
    });
    d = applyMutation(d, "delete_food", { id });
    d = applyMutation(d, "meal", {
      ...d.meals[0],
      consumed_at: "2026-10-28T03:00:00Z",
    });
    expect(d.meals[0].calories_kcal).toBe(600);
    expect(d.meals[0].food_id).toBeNull();
    expect(decodeBackup(encodeBackup(d))).toEqual(d);
  });
  it("records templates with both serving and gram foods and round-trips backups", () => {
    let d = fixture();
    d = applyMutation(d, "food", {
      ...metadata,
      name: "架空の副菜",
      ...nutrients,
    });
    const items = [
      { food_id: d.foods[0].id, serving: { unit: "杯", quantity: 0.5 } },
      { food_id: d.foods[1].id, amount_g: 50 },
    ];
    d = applyMutation(d, "template", { name: "外食セット", items });
    d = applyMutation(d, "apply_template", {
      id: d.templates[0].id,
      ...mealInput,
    });
    expect(d.meals).toHaveLength(2);
    expect(d.meals.every((m) => m.calories_kcal === 300)).toBe(true);
    expect(decodeBackup(encodeBackup(d))).toEqual(d);
    expect(JSON.parse(encodeBackup(d)).version).toBe(2);
    expect(JSON.parse(encodeBackup(initialData())).version).toBe(1);
  });
  it("suggests only observed serving counts alongside gram foods", () => {
    let d = fixture();
    const a = d.foods[0].id;
    d = applyMutation(d, "meal", {
      food_id: a,
      ...mealInput,
      serving: { quantity: 0.5, unit: "杯" },
    });
    d = applyMutation(d, "food", {
      ...metadata,
      name: "架空の副菜",
      protein: 20,
      fat: 0,
      carbs: 0,
      kcal: 80,
    });
    d = applyMutation(d, "meal", {
      food_id: d.foods[1].id,
      ...mealInput,
      amount_g: 50,
    });
    const zero = { protein: 0, fat: 0, carbs: 0, kcal: 0 };
    const plan = recommend(
      d.foods,
      zero,
      { protein: 25, fat: 10, carbs: 50, kcal: 400 },
      d.meals,
      "2026-10-28",
    );
    expect(plan).toHaveLength(2);
    expect(plan.find((x) => x.food.id === a)).toMatchObject({
      serving: { quantity: 0.5, unit: "杯" },
    });
    expect(plan.find((x) => x.food.id === a)?.grams).toBeUndefined();
    expect(project(zero, plan).kcal).toBe("340");
    expect(recommend(d.foods, zero, nutrients, d.meals, "2026-10-27")).toEqual(
      [],
    );
  });
  it("preserves serving fields through encryption and device merges", async () => {
    const base = initialData();
    let local = applyMutation(base, "food", payload());
    local = applyMutation(local, "meal", {
      food_id: local.foods[0].id,
      ...mealInput,
      serving: { quantity: 1, unit: "杯" },
    });
    const code = newSyncCode();
    const decrypted = await decryptSync(code, await encryptSync(code, local));
    expect(decrypted).toEqual(local);
    expect(mergeData(base, local, base)).toEqual(local);
  });
});
