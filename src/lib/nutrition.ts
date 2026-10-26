import Decimal from "decimal.js";
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
