import { describe, it, expect } from "vitest";
import { recommend, project, observedServings } from "../src/lib/recommend";
import { initialData, applyMutation } from "../src/lib/local-data";
function fixture() {
  let d = initialData();
  for (const [name, protein, fat, carbs, kcal, grams] of [
    ["スーパー大麦", 10, 2, 65, 320, 20],
    ["たまご", 12, 10, 1, 150, 50],
    ["架空P食品", 20, 0, 0, 80, 100],
    ["架空C食品", 0, 0, 25, 100, 100],
  ] as const) {
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
    d = applyMutation(d, "meal", {
      food_id: d.foods.at(-1)!.id,
      amount_g: grams,
      meal_type: "breakfast",
      consumed_at: "2026-10-25T00:00:00Z",
    });
  }
  return d;
}
const zero = { protein: 0, fat: 0, carbs: 0, kcal: 0 };
describe("realistic serving suggestions", () => {
  it("uses only actually recorded amounts, never optimized 204g or 201g quantities", () => {
    const d = fixture();
    const s = recommend(
      d.foods,
      zero,
      { protein: 100, fat: 50, carbs: 250, kcal: 2000 },
      d.meals,
      "2026-10-26",
    );
    expect(s.length).toBeGreaterThan(1);
    expect(s.find((x) => x.food.name === "スーパー大麦")?.grams).toBe(20);
    expect(s.find((x) => x.food.name === "たまご")?.grams).toBe(50);
    expect(
      s.every((x) =>
        d.meals.some(
          (m) => m.food_id === x.food.id && Number(m.amount_g) === x.grams,
        ),
      ),
    ).toBe(true);
  });
  it("does not suggest untried foods or multiply a serving to fill deficits", () => {
    const d = fixture();
    expect(
      recommend(
        d.foods,
        zero,
        { protein: 100, fat: 50, carbs: 250, kcal: 2000 },
        [],
      ),
    ).toEqual([]);
    const s = recommend(
      [d.foods[1]],
      zero,
      { protein: 100, fat: 50, carbs: 250, kcal: 2000 },
      d.meals,
    );
    expect(s).toHaveLength(1);
    expect(s[0].grams).toBe(50);
  });
  it("prefers common observed servings, keeps separate snacks separate and excludes future meals", () => {
    let d = fixture();
    const id = d.foods[1].id;
    for (const [amount_g, consumed_at] of [
      [50, "2026-10-25T02:00:00Z"],
      [100, "2026-10-25T03:00:00Z"],
      [201, "2027-01-01T03:00:00Z"],
    ] as const)
      d = applyMutation(d, "meal", {
        food_id: id,
        amount_g,
        consumed_at,
        meal_type: "snack",
      });
    expect(observedServings(id, d.meals, "2026-10-26")).toEqual([
      { grams: 50, observations: 2 },
      { grams: 100, observations: 1 },
    ]);
  });
  it("combines complementary items and never selects one food twice", () => {
    const d = fixture(),
      g = { protein: 30, fat: 5, carbs: 40, kcal: 340 },
      s = recommend(d.foods, zero, g, d.meals);
    expect(s.length).toBeGreaterThan(1);
    expect(new Set(s.map((x) => x.food.id)).size).toBe(s.length);
    expect(Number(project(zero, s).kcal)).toBeGreaterThan(0);
  });
  it("handles zero goals, reached goals, empty and zero-nutrient foods", () => {
    const d = fixture();
    expect(recommend(d.foods, zero, zero, d.meals)).toEqual([]);
    expect(
      recommend([], zero, { protein: 10, fat: 0, carbs: 0, kcal: 40 }, []),
    ).toEqual([]);
    const f = {
      ...d.foods[0],
      protein_100g: 0,
      fat_100g: 0,
      carbs_100g: 0,
      kcal_100g: 0,
    };
    expect(
      recommend(
        [f],
        zero,
        { protein: 10, fat: 0, carbs: 0, kcal: 40 },
        d.meals,
      ),
    ).toEqual([]);
  });
  it("preserves published energy and never changes history or food masters", () => {
    const d = fixture(),
      copy = structuredClone(d),
      s = recommend(
        [d.foods[1]],
        zero,
        { protein: 20, fat: 10, carbs: 5, kcal: 150 },
        d.meals,
      );
    expect(Number(project(zero, s).kcal)).toBe(75);
    expect(d).toEqual(copy);
  });
});
