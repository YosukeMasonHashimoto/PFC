import { describe, it, expect } from "vitest";
import { recommend, project } from "../src/lib/recommend";
import { initialData, applyMutation } from "../src/lib/local-data";
function foods() {
  let d = initialData();
  for (const [name, protein, fat, carbs, kcal] of [
    ["架空P食品", 20, 0, 0, 80],
    ["架空F食品", 0, 10, 0, 90],
    ["架空C食品", 0, 0, 25, 100],
  ] as const)
    d = applyMutation(d, "food", {
      name,
      protein,
      fat,
      carbs,
      kcal,
      brand: "",
      source_type: "estimated",
      source_ref: "test",
      source_version: "",
      energy_basis: "test",
      portions: [],
    });
  return d.foods;
}
const zero = { protein: 0, fat: 0, carbs: 0, kcal: 0 };
describe("calculated food suggestions", () => {
  it("finds gram quantities for complementary registered foods", () => {
    const f = foods();
    const goal = { protein: 40, fat: 10, carbs: 50, kcal: 450 };
    const s = recommend(f, zero, goal);
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(3);
    const n = project(zero, s);
    expect(Number(n.protein)).toBeCloseTo(40, 0);
    expect(Number(n.fat)).toBeCloseTo(10, 0);
    expect(Number(n.carbs)).toBeCloseTo(50, 0);
    expect(Number(n.kcal)).toBeCloseTo(450, 0);
  });
  it("does not suggest more food when targets are reached or exceeded", () => {
    expect(
      recommend(
        foods(),
        { protein: 100, fat: 100, carbs: 100, kcal: 1000 },
        { protein: 10, fat: 10, carbs: 10, kcal: 100 },
      ),
    ).toEqual([]);
    expect(recommend(foods(), zero, zero)).toEqual([]);
  });
  it("handles no foods and zero-nutrition foods without division by zero", () => {
    expect(
      recommend([], zero, { protein: 10, fat: 0, carbs: 0, kcal: 40 }),
    ).toEqual([]);
    const f = foods()[0];
    expect(
      recommend(
        [{ ...f, protein_100g: 0, fat_100g: 0, carbs_100g: 0, kcal_100g: 0 }],
        zero,
        { protein: 10, fat: 0, carbs: 0, kcal: 40 },
      ),
    ).toEqual([]);
  });
  it("recalculates after a recorded meal and keeps displayed quantities bounded", () => {
    const f = foods(),
      g = { protein: 40, fat: 10, carbs: 50, kcal: 450 };
    const before = recommend(f, zero, g);
    const after = recommend(f, { protein: 20, fat: 0, carbs: 0, kcal: 80 }, g);
    expect(after.find((s) => s.food.id === f[0].id)?.grams).toBeLessThan(
      before.find((s) => s.food.id === f[0].id)!.grams,
    );
    expect(
      after.every(
        (s) => Number.isInteger(s.grams) && s.grams > 0 && s.grams <= 500,
      ),
    ).toBe(true);
  });
  it("keeps zero goals and published calories independent", () => {
    const f = foods()[0];
    const s = recommend([f], zero, {
      protein: 40,
      fat: 0,
      carbs: 0,
      kcal: 100,
    });
    const n = project(zero, s);
    expect(Number(n.kcal)).toBe(Number(n.protein) * 4);
    expect(s.length).toBe(1);
    expect(Number(n.protein)).not.toBe(40);
  });
  it("does not mutate food masters or totals", () => {
    const f = foods(),
      copy = structuredClone(f),
      total = { ...zero };
    recommend(f, total, { protein: 10, fat: 10, carbs: 10, kcal: 200 });
    expect(f).toEqual(copy);
    expect(total).toEqual(zero);
  });
});
