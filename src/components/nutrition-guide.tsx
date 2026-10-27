"use client";
import { useMemo } from "react";
import { recommend, project } from "@/lib/recommend";
import { keys, type Nutrients } from "@/lib/nutrition";
import type { Meal, Food } from "@/lib/types";
import { Button } from "./ui/button";
import { AppLink } from "./pwa";
const labels = { protein: "P", fat: "F", carbs: "C", kcal: "カロリー" };
const f = (value: number | string) =>
  Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
function Remaining({
  value,
  goal,
  metric,
}: {
  value: number | string;
  goal: number | string;
  metric: (typeof keys)[number];
}) {
  const diff = Number(goal) - Number(value);
  return (
    <span className={diff < 0 ? "over-target" : ""}>
      {labels[metric]} {diff < 0 ? "超過" : "あと"} {f(Math.abs(diff))}
      {metric === "kcal" ? "kcal" : "g"}
    </span>
  );
}
export function NutritionGuide({
  date,
  foods,
  meals,
  totals,
  goals,
  onRecord,
}: {
  date: string;
  foods: Food[];
  meals: Meal[];
  totals: Nutrients;
  goals: Nutrients;
  onRecord: (food: Food, grams: number) => void;
}) {
  const { protein: p, fat: fats, carbs: c, kcal: k } = totals;
  const { protein: gp, fat: gf, carbs: gc, kcal: gk } = goals;
  const suggestions = useMemo(
    () =>
      recommend(
        foods,
        { protein: p, fat: fats, carbs: c, kcal: k },
        { protein: gp, fat: gf, carbs: gc, kcal: gk },
        meals,
        date,
      ),
    [foods, meals, date, p, fats, c, k, gp, gf, gc, gk],
  );
  const reached = keys.every(
    (key) => Number(totals[key]) >= Number(goals[key]),
  );
  const after = project(totals, suggestions);
  return (
    <section className="card nutrition-guide" aria-label="目標までの食事目安">
      <div className="guide-heading">
        <h2>目標までの食事目安</h2>
        <small>{date} · 日本時間</small>
      </div>
      <div className="remaining-chips" aria-live="polite">
        {keys.map((key) => (
          <Remaining
            key={key}
            metric={key}
            value={totals[key]}
            goal={goals[key]}
          />
        ))}
      </div>
      {reached ? (
        <p className="guide-done">
          4つの目標すべてに到達しています。追加の候補はありません。
        </p>
      ) : suggestions.length ? (
        <>
          <div className="guide-suggestions">
            {suggestions.map((x) => (
              <div key={x.food.id}>
                <span>
                  <strong>{x.food.name}</strong> を <b>{x.grams}g</b>
                  （記録した1食分）
                </span>
                <Button
                  size="default"
                  variant="outline"
                  onClick={() => onRecord(x.food, x.grams)}
                >
                  この分量で記録
                </Button>
              </div>
            ))}
          </div>
          <details>
            <summary>候補をすべて食べた場合の残量・超過</summary>
            <div className="remaining-chips">
              {keys.map((key) => (
                <Remaining
                  key={key}
                  metric={key}
                  value={after[key]}
                  goal={goals[key]}
                />
              ))}
            </div>
          </details>
          <small>
            過去に記録した1食分だけを組み合わせた目安です。残量は無理に1品の量を増やして埋めません。候補後にも不足・超過が残る場合があります。
          </small>
        </>
      ) : (
        <p className="muted">
          {foods.length
            ? "食事の実績がある食品から、目標に近づく組み合わせを見つけられませんでした。まず普段食べる分量を記録してください。"
            : "食品を登録すると、あと何を何g食べるかの目安が表示されます。"}{" "}
          <AppLink href="/foods">食品を登録する</AppLink>
        </p>
      )}
    </section>
  );
}
