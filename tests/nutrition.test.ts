import { describe, it, expect } from "vitest";
import {
  calculate,
  portionGrams,
  aggregate,
  localDate,
  progress,
} from "../src/lib/nutrition";
import { mealSchema, foodSchema, targetSchema } from "../src/lib/validation";
const food = { protein: "12.34", fat: "5.67", carbs: "23.45", kcal: "189" };
describe("nutrition precision and published energy", () => {
  it("converts registered portions with decimal precision", () => {
    expect(portionGrams("0.1", "3")).toBe("0.3");
    expect(portionGrams(1, 150)).toBe("150");
    expect(() => portionGrams(1, 0)).toThrow();
  });
  it("calculates 100g, 300g and a registered 150g pack without 4/9/4 replacement", () => {
    expect(calculate(food, 100)).toEqual(food);
    expect(calculate(food, 300)).toEqual({
      protein: "37.02",
      fat: "17.01",
      carbs: "70.35",
      kcal: "567",
    });
    expect(calculate(food, 150).kcal).toBe("283.5");
  });
  it("aggregates snapshots without intermediate rounding", () => {
    const x = calculate({ protein: 0.1, fat: 0, carbs: 0, kcal: 1 }, 33.3);
    expect(aggregate([x, x, x]).protein).toBe("0.0999");
  });
  it.each([0, -1, Infinity, NaN, 100001])("rejects weight %s", (n) =>
    expect(() => calculate(food, n)).toThrow(),
  );
  it("shows excess and avoids division by zero", () => {
    expect(progress(120, 100)).toEqual({ remaining: -20, percent: 120 });
    expect(progress(10, 0)).toEqual({ remaining: -10, percent: null });
  });
  it("respects JST midnight independent of device timezone", () => {
    expect(localDate("2026-10-25T14:59:59Z")).toBe("2026-10-25");
    expect(localDate("2026-10-25T15:00:00Z")).toBe("2026-10-26");
    expect(localDate("2027-01-01T00:00:00+09:00")).toBe("2027-01-01");
  });
});
describe("server validation", () => {
  const meal = {
    food_id: "11111111-1111-4111-8111-111111111111",
    amount_g: 100,
    consumed_at: "2026-10-26T00:00:00+09:00",
    meal_type: "breakfast",
  };
  it("rejects zero, negative, missing and excessive meal weights", () => {
    for (const n of [0, -1, undefined, null, "", " ", Infinity, 100001])
      expect(mealSchema.safeParse({ ...meal, amount_g: n }).success).toBe(
        false,
      );
  });
  it("requires timezone-aware timestamps", () => {
    expect(mealSchema.safeParse(meal).success).toBe(true);
    expect(
      mealSchema.safeParse({ ...meal, consumed_at: "2026-10-26T00:00" })
        .success,
    ).toBe(false);
  });
  it("rejects missing food nutrients and duplicate portions", () => {
    const valid = {
      name: "架空テスト",
      protein: 0,
      fat: 0,
      carbs: 0,
      kcal: 0,
      source_type: "estimated",
      source_ref: "test only",
      source_version: "test",
      energy_basis: "test",
      portions: [],
    };
    expect(foodSchema.safeParse(valid).success).toBe(true);
    for (const value of [undefined, null, "", " "]) {
      expect(foodSchema.safeParse({ ...valid, protein: value }).success).toBe(
        false,
      );
    }
    expect(
      foodSchema.safeParse({
        ...valid,
        portions: [
          { label: "1個", grams: 10 },
          { label: "1個", grams: 20 },
        ],
      }).success,
    ).toBe(false);
  });
  it("allows independent zero-valued targets", () =>
    expect(
      targetSchema.parse({
        protein: 0,
        fat: 0,
        carbs: 0,
        kcal: 100,
        effective_from: "2026-10-26",
      }).kcal,
    ).toBe(100));
});
