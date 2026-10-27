import Decimal from "decimal.js";
import type { Food, Meal, Serving } from "./types";
import { calculateFood, hasWeight, keys, type Nutrients } from "./nutrition";
export type Suggestion = {
  food: Food;
  grams?: number;
  serving?: Serving;
  observations: number;
};
/** One observation is one recorded food entry, not all snacks aggregated across a day. */
export function observedServings(
  foodId: string,
  meals: Meal[],
  date: string,
): { grams: number; observations: number }[] {
  const recent = meals
    .filter(
      (m) =>
        m.food_id === foodId &&
        m.local_date <= date &&
        m.amount_g !== undefined &&
        m.amount_g > 0 &&
        Number.isFinite(m.amount_g),
    )
    .sort((a, b) => Date.parse(b.consumed_at) - Date.parse(a.consumed_at))
    .slice(0, 30);
  const sizes = new Map<
    number,
    { grams: number; observations: number; recent: number }
  >();
  recent.forEach((m, i) => {
    const old = sizes.get(Number(m.amount_g));
    sizes.set(Number(m.amount_g), {
      grams: Number(m.amount_g),
      observations: (old?.observations || 0) + 1,
      recent: old?.recent ?? i,
    });
  });
  return [...sizes.values()]
    .sort((a, b) => b.observations - a.observations || a.recent - b.recent)
    .slice(0, 3)
    .map(({ grams, observations }) => ({ grams, observations }));
}
function observedPortions(
  food: Food,
  meals: Meal[],
  date: string,
): Omit<Suggestion, "food">[] {
  const grams = hasWeight(food) ? observedServings(food.id, meals, date) : [];
  if (!food.serving) return grams;
  const recent = meals
    .filter(
      (m) =>
        m.food_id === food.id &&
        m.local_date <= date &&
        m.serving?.unit === food.serving!.unit,
    )
    .sort((a, b) => Date.parse(b.consumed_at) - Date.parse(a.consumed_at))
    .slice(0, 30);
  const counts = new Map<
    number,
    { serving: Serving; observations: number; recent: number }
  >();
  recent.forEach((m, i) => {
    const quantity = m.serving!.quantity;
    const old = counts.get(quantity);
    counts.set(quantity, {
      serving: m.serving!,
      observations: (old?.observations || 0) + 1,
      recent: old?.recent ?? i,
    });
  });
  return [
    ...grams,
    ...[...counts.values()]
      .sort((a, b) => b.observations - a.observations || a.recent - b.recent)
      .slice(0, 3)
      .map(({ serving, observations }) => ({ serving, observations })),
  ];
}
/** Discrete beam search: never invent grams, fractions or multiples of observed servings. */
export function recommend(
  foods: Food[],
  totals: Nutrients,
  goals: Nutrients,
  meals: Meal[] = [],
  date = "9999-12-31",
): Suggestion[] {
  const deficit = keys.map((k) =>
    Math.max(0, Number(goals[k]) - Number(totals[k])),
  );
  if (deficit.every((v) => v === 0)) return [];
  const scales = keys.map((k) => Math.max(Number(goals[k]), 1)),
    b = deficit.map((v, i) => v / scales[i]);
  const score = (a: number[]) =>
    a.reduce((s, v, i) => {
      const residual = v - b[i];
      return s + residual * residual * (residual > 0 ? 2 : 1);
    }, 0);
  const initial = score([0, 0, 0, 0]);
  const choices = foods
    .flatMap((food) =>
      observedPortions(food, meals, date).map((portion) => ({
        food,
        ...portion,
        a: keys.map(
          (k, i) =>
            Number(
              calculateFood(food, {
                amount_g: portion.grams,
                serving: portion.serving,
              })[k],
            ) / scales[i],
        ),
      })),
    )
    .filter((c) => c.a.every(Number.isFinite) && c.a.some((v) => v > 0));
  // Select food candidates rather than dropping complementary small servings solely by gram fit.
  const ranked = [...choices].sort((a, b) => score(a.a) - score(b.a));
  const foodIds = new Set(ranked.slice(0, 45).map((c) => c.food.id));
  for (let k = 0; k < 4; k++) {
    if (!deficit[k]) continue;
    const c = [...choices].sort(
      (a, b) => b.a[k] / Math.hypot(...b.a) - a.a[k] / Math.hypot(...a.a),
    )[0];
    if (c) foodIds.add(c.food.id);
  }
  const pool = choices.filter((c) => foodIds.has(c.food.id));
  type Plan = { items: typeof pool; a: number[]; score: number };
  let beam: Plan[] = [{ items: [], a: [0, 0, 0, 0], score: initial }],
    best = beam[0];
  for (let depth = 0; depth < 5; depth++) {
    const expanded: Plan[] = [],
      seen = new Set<string>();
    for (const plan of beam)
      for (const item of pool) {
        if (plan.items.some((i) => i.food.id === item.food.id)) continue;
        const items = [...plan.items, item];
        const signature = items
          .map(
            (x) =>
              `${x.food.id}:${x.serving ? `${x.serving.quantity}${x.serving.unit}` : `${x.grams}g`}`,
          )
          .sort()
          .join("|");
        if (seen.has(signature)) continue;
        seen.add(signature);
        const a = plan.a.map((v, i) => v + item.a[i]),
          next = { items, a, score: score(a) };
        expanded.push(next);
        if (next.score < best.score - 1e-9) best = next;
      }
    beam = expanded
      .sort((a, b) => a.score - b.score || a.items.length - b.items.length)
      .slice(0, 40);
    if (!beam.length) break;
  }
  return best.score < initial - 1e-8
    ? best.items.map(({ food, grams, serving, observations }) => ({
        food,
        ...(serving ? { serving } : { grams }),
        observations,
      }))
    : [];
}
export function project(
  totals: Nutrients,
  suggestions: Suggestion[],
): Nutrients {
  const added = suggestions.map((x) =>
    calculateFood(x.food, { amount_g: x.grams, serving: x.serving }),
  );
  return Object.fromEntries(
    keys.map((k) => [
      k,
      added.reduce((s, n) => s.plus(n[k]), new Decimal(totals[k])).toString(),
    ]),
  ) as Nutrients;
}
