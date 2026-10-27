import Decimal from "decimal.js";
import type { Food, FoodAmount } from "./types";
export const keys = ["protein", "fat", "carbs", "kcal"] as const;
export type Nutrients = Record<(typeof keys)[number], string | number>;
export const defaults: Nutrients = {
  protein: 107,
  fat: 70,
  carbs: 335,
  kcal: 2400,
};
export function calculate(food: Nutrients, grams: string | number): Nutrients {
  const g = new Decimal(grams);
  if (!g.isFinite() || g.lte(0) || g.gt(100000))
    throw new Error("重量は0より大きく100,000g以下で入力してください");
  return Object.fromEntries(
    keys.map((k) => [k, new Decimal(food[k]).mul(g).div(100).toString()]),
  ) as Nutrients;
}
/** Convert label values for an arbitrary serving to the existing 100g basis. */
export function per100g(food: Nutrients, grams: string | number): Nutrients {
  const g = new Decimal(grams);
  if (!g.isFinite() || g.lte(0) || g.gt(100000))
    throw new Error("基準の分量は0より大きく100,000g以下で入力してください。");
  return Object.fromEntries(
    keys.map((key) => {
      const value = new Decimal(food[key]);
      const normalized = value.mul(100).div(g);
      if (
        !value.isFinite() ||
        value.lt(0) ||
        value.gt(100000) ||
        normalized.gt(100000)
      )
        throw new Error(
          "栄養値は0以上で、100g換算で100,000以下になるよう入力してください。",
        );
      return [key, normalized.toString()];
    }),
  ) as Nutrients;
}
export function aggregate(items: Nutrients[]): Nutrients {
  return Object.fromEntries(
    keys.map((k) => [
      k,
      items.reduce((s, x) => s.plus(x[k]), new Decimal(0)).toString(),
    ]),
  ) as Nutrients;
}
export function progress(value: string | number, target: string | number) {
  const v = new Decimal(value),
    t = new Decimal(target);
  return {
    remaining: t.minus(v).toNumber(),
    percent: t.isZero() ? null : v.div(t).mul(100).toNumber(),
  };
}
export function localDate(iso: string, zone = "Asia/Tokyo") {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)!.value)
    .join("-");
}

export function portionGrams(
  quantity: string | number,
  gramsPerPortion: string | number,
): string {
  const value = new Decimal(quantity).mul(gramsPerPortion);
  if (!value.isFinite() || value.lte(0) || value.gt(100000))
    throw new Error("ポーションの重量が範囲外です");
  return value.toString();
}

export function hasWeight(food: Food): boolean {
  return !food.serving || food.serving.grams !== undefined;
}
export function foodNutrients(food: Food): Nutrients {
  return (
    food.serving || {
      protein: food.protein_100g!,
      fat: food.fat_100g!,
      carbs: food.carbs_100g!,
      kcal: food.kcal_100g!,
    }
  );
}
export function calculateFood(food: Food, amount: FoodAmount): Nutrients {
  if (amount.serving && amount.amount_g === undefined) {
    if (!food.serving || food.serving.unit !== amount.serving.unit)
      throw new Error(
        "食品の単位が変更されています。食品と分量を選び直してください。",
      );
    const q = new Decimal(amount.serving.quantity);
    if (!q.isFinite() || q.lte(0) || q.gt(100000))
      throw new Error("個数・杯数は0より大きく100,000以下で入力してください。");
    return Object.fromEntries(
      keys.map((k) => [k, new Decimal(food.serving![k]).mul(q).toString()]),
    ) as Nutrients;
  }
  if (amount.serving || amount.amount_g === undefined || !hasWeight(food))
    throw new Error("重量が不明な食品は食・個・杯で記録してください。");
  if (food.serving?.grams) {
    const g = new Decimal(amount.amount_g);
    if (!g.isFinite() || g.lte(0) || g.gt(100000))
      throw new Error("重量は0より大きく100,000g以下で入力してください");
    return Object.fromEntries(
      keys.map((k) => [
        k,
        new Decimal(food.serving![k])
          .mul(g)
          .div(food.serving!.grams!)
          .toString(),
      ]),
    ) as Nutrients;
  }
  return calculate(
    {
      protein: food.protein_100g!,
      fat: food.fat_100g!,
      carbs: food.carbs_100g!,
      kcal: food.kcal_100g!,
    },
    amount.amount_g,
  );
}
export function sameAmount(a: FoodAmount, b: FoodAmount): boolean {
  return (
    a.amount_g === b.amount_g &&
    a.serving?.unit === b.serving?.unit &&
    a.serving?.quantity === b.serving?.quantity
  );
}
export function formatAmount(amount: FoodAmount): string {
  const format = (n: number) =>
    n.toLocaleString("ja-JP", { maximumFractionDigits: 3 });
  return amount.serving
    ? `${format(amount.serving.quantity)}${amount.serving.unit}`
    : `${format(amount.amount_g!)} g`;
}
