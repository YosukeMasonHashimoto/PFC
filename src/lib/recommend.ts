import type { Food } from "./types";
import { calculate, keys, type Nutrients } from "./nutrition";
export type Suggestion = { food: Food; grams: number };
const nutrition = (f: Food): Nutrients => ({
  protein: f.protein_100g,
  fat: f.fat_100g,
  carbs: f.carbs_100g,
  kcal: f.kcal_100g,
});
/** Bounded, nonnegative least-squares heuristic over the user's own foods, not a guaranteed exact solution. */
export function recommend(
  foods: Food[],
  totals: Nutrients,
  goals: Nutrients,
): Suggestion[] {
  const target = keys.map((k) =>
    Math.max(0, Number(goals[k]) - Number(totals[k])),
  );
  if (target.every((x) => x <= 0)) return [];
  const scales = keys.map((k) => Math.max(Number(goals[k]), 1));
  const b = target.map((v, i) => v / scales[i]);
  const candidates = foods
    .map((food) => ({
      food,
      a: keys.map((k, i) => Number(nutrition(food)[k]) / 100 / scales[i]),
    }))
    .filter((c) => c.a.every(Number.isFinite) && c.a.some((x) => x > 0));
  const fit = (rows: typeof candidates) => {
    const x = rows.map(() => 0),
      res = b.map((v) => -v);
    for (let round = 0; round < 40; round++) {
      let change = 0;
      for (let j = 0; j < rows.length; j++) {
        const a = rows[j].a,
          den = a.reduce((s, v) => s + v * v, 0);
        const gradient = a.reduce((s, v, i) => s + v * res[i], 0);
        const next = Math.max(0, Math.min(500, x[j] - gradient / den)),
          delta = next - x[j];
        for (let k = 0; k < 4; k++) res[k] += delta * a[k];
        x[j] = next;
        change += Math.abs(delta);
      }
      if (change < 1e-7) break;
    }
    return { x, score: res.reduce((s, v) => s + v * v, 0) };
  };
  const initial = b.reduce((s, v) => s + v * v, 0);
  // Keep computation bounded while retaining the strongest candidate for each remaining nutrient.
  const ranked = candidates
    .map((c) => ({ c, score: fit([c]).score }))
    .sort(
      (a, b) => a.score - b.score || a.c.food.id.localeCompare(b.c.food.id),
    );
  const pool = ranked.slice(0, 24).map((r) => r.c);
  for (let k = 0; k < 4; k++) {
    if (!target[k]) continue;
    const specialist = [...candidates].sort(
      (a, b) => b.a[k] / Math.hypot(...b.a) - a.a[k] / Math.hypot(...a.a),
    )[0];
    if (specialist && !pool.includes(specialist)) pool.push(specialist);
  }
  let selected: typeof candidates = [],
    best = initial;
  for (let step = 0; step < 3; step++) {
    let winner: (typeof candidates)[number] | undefined,
      score = best;
    for (const candidate of pool) {
      if (selected.includes(candidate)) continue;
      const attempt = fit([...selected, candidate]);
      if (attempt.score < score - 1e-8) {
        winner = candidate;
        score = attempt.score;
      }
    }
    if (!winner) break;
    selected = [...selected, winner];
    best = score;
  }
  const quantities = fit(selected).x.map(Math.round);
  const score = b.reduce(
    (s, v, k) =>
      s +
      Math.pow(
        selected.reduce((n, c, j) => n + c.a[k] * quantities[j], 0) - v,
        2,
      ),
    0,
  );
  if (score >= initial - 1e-8) return [];
  return selected
    .map((c, i) => ({ food: c.food, grams: quantities[i] }))
    .filter((x) => x.grams > 0);
}
export function project(
  totals: Nutrients,
  suggestions: Suggestion[],
): Nutrients {
  const added = suggestions.map((x) => calculate(nutrition(x.food), x.grams));
  // Retain decimal precision when summing snapshot and suggested values.
  return Object.fromEntries(
    keys.map((k) => [
      k,
      added.reduce((s, n) => s.plus(n[k]), new Decimal(totals[k])).toString(),
    ]),
  ) as Nutrients;
}
import Decimal from "decimal.js";
