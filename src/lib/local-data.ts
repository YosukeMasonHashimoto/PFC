import { z } from "zod";
import {
  mutationSchema,
  foodServingSchema,
  amountFields,
  hasOneAmount,
} from "./validation";
import {
  calculateFood,
  localDate,
  sameAmount,
  per100g,
  keys,
} from "./nutrition";
import type { Food, Meal, TrackerData, FoodAmount } from "./types";
export function initialData(): TrackerData {
  return {
    user_id: crypto.randomUUID(),
    foods: [],
    meals: [],
    targets: [
      {
        id: crypto.randomUUID(),
        effective_from: "0001-01-01",
        protein_g: 107,
        fat_g: 70,
        carbs_g: 335,
        calories_kcal: 2400,
      },
    ],
    favorites: [],
    templates: [],
  };
}
function required<T>(value: T | undefined): T {
  if (!value)
    throw new Error(
      "対象の食品・記録が見つかりません。再読み込みしてください。",
    );
  return value;
}
function snapshot(
  data: TrackerData,
  input: FoodAmount & {
    food_id: string | null;
    consumed_at: string;
    meal_type: string;
    id?: string;
  },
  old?: Meal,
): Meal {
  const unchanged =
    old && old.food_id === input.food_id && sameAmount(old, input);
  const base = {
    id: old?.id || crypto.randomUUID(),
    food_id: input.food_id,
    ...(input.serving
      ? { serving: input.serving }
      : { amount_g: input.amount_g }),
    consumed_at: input.consumed_at,
    local_date: localDate(input.consumed_at),
    meal_type: input.meal_type,
  };
  if (unchanged) return { ...old, ...base };
  const food = required(data.foods.find((f) => f.id === input.food_id));
  const n = calculateFood(food, input);
  return {
    ...base,
    food_name_snapshot: food.name,
    source_snapshot: {
      source_type: food.source_type,
      source_ref: food.source_ref,
    },
    protein_g: Number(n.protein),
    fat_g: Number(n.fat),
    carbs_g: Number(n.carbs),
    calories_kcal: Number(n.kcal),
  };
}
/** Pure reducer; callers persist only the complete successful result. */
export function applyMutation(
  state: TrackerData,
  action: string,
  payload: unknown,
): TrackerData {
  const parsed = mutationSchema.safeParse({ action, data: payload });
  if (!parsed.success)
    throw new Error(
      "入力値を確認してください。重量は正数、栄養値は0以上で指定してください。",
    );
  const next = structuredClone(state);
  const op = parsed.data;
  switch (op.action) {
    case "food": {
      const p = op.data;
      const old = p.id
        ? required(next.foods.find((f) => f.id === p.id))
        : undefined;
      if (p.serving) {
        const expected = p.serving.grams
          ? per100g(p.serving, p.serving.grams)
          : Object.fromEntries(keys.map((k) => [k, 0]));
        if (keys.some((k) => Number(expected[k]) !== p[k]))
          throw new Error("基準の分量と栄養値が一致しません。");
      }
      const food: Food = {
        id: old?.id || crypto.randomUUID(),
        owner_id: next.user_id,
        name: p.name,
        brand: p.brand,
        protein_100g: p.serving && !p.serving.grams ? null : p.protein,
        fat_100g: p.serving && !p.serving.grams ? null : p.fat,
        carbs_100g: p.serving && !p.serving.grams ? null : p.carbs,
        kcal_100g: p.serving && !p.serving.grams ? null : p.kcal,
        source_type: p.source_type,
        source_ref: p.source_ref,
        source_version: p.source_version,
        energy_basis: p.energy_basis,
        ...(p.serving ? { serving: p.serving } : {}),
        portions: p.portions.map((x) => ({ ...x, id: crypto.randomUUID() })),
      };
      next.foods = old
        ? next.foods.map((f) => (f.id === old.id ? food : f))
        : [...next.foods, food];
      break;
    }
    case "delete_food": {
      required(next.foods.find((f) => f.id === op.data.id));
      next.foods = next.foods.filter((f) => f.id !== op.data.id);
      next.favorites = next.favorites.filter((id) => id !== op.data.id);
      next.meals = next.meals.map((m) =>
        m.food_id === op.data.id ? { ...m, food_id: null } : m,
      );
      next.templates = next.templates.map((t) => ({
        ...t,
        items: t.items.filter((i) => i.food_id !== op.data.id),
      }));
      break;
    }
    case "meal": {
      const p = op.data;
      const old = p.id
        ? required(next.meals.find((m) => m.id === p.id))
        : undefined;
      const entry = snapshot(next, p, old);
      next.meals = old
        ? next.meals.map((m) => (m.id === old.id ? entry : m))
        : [entry, ...next.meals];
      break;
    }
    case "delete_meal":
      next.meals = next.meals.filter((m) => m.id !== op.data.id);
      break;
    case "target": {
      const p = op.data,
        old = next.targets.find((t) => t.effective_from === p.effective_from);
      next.targets = next.targets.filter(
        (t) => t.effective_from !== p.effective_from,
      );
      next.targets.push({
        id: old?.id || crypto.randomUUID(),
        effective_from: p.effective_from,
        protein_g: p.protein,
        fat_g: p.fat,
        carbs_g: p.carbs,
        calories_kcal: p.kcal,
      });
      break;
    }
    case "favorite":
      required(next.foods.find((f) => f.id === op.data.food_id));
      next.favorites = next.favorites.filter((id) => id !== op.data.food_id);
      if (op.data.enabled) next.favorites.push(op.data.food_id);
      break;
    case "template": {
      op.data.items.forEach((i) =>
        calculateFood(required(next.foods.find((f) => f.id === i.food_id)), i),
      );
      next.templates.push({
        id: crypto.randomUUID(),
        name: op.data.name,
        items: op.data.items,
      });
      break;
    }
    case "delete_template":
      next.templates = next.templates.filter((t) => t.id !== op.data.id);
      break;
    case "apply_template": {
      const template = required(
        next.templates.find((t) => t.id === op.data.id),
      );
      if (!template.items.length)
        throw new Error("テンプレートに食品がありません。作り直してください。");
      const meals = template.items.map((i) =>
        snapshot(next, {
          ...i,
          consumed_at: op.data.consumed_at,
          meal_type: op.data.meal_type,
        }),
      );
      next.meals = [...meals, ...next.meals];
      break;
    }
  }
  next.meals.sort(
    (a, b) => Date.parse(b.consumed_at) - Date.parse(a.consumed_at),
  );
  next.targets.sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return next;
}
const id = z.uuid(),
  text = z.string().max(1000),
  num = z.number().finite().min(0).max(100000),
  amount = z.number().finite().gt(0).max(100000),
  snap = z.number().finite().min(0).max(10000000000);
const food = z.object({
  id,
  owner_id: id.nullable(),
  name: z.string().trim().min(1).max(150),
  brand: z.string().max(150),
  protein_100g: num.nullable(),
  fat_100g: num.nullable(),
  carbs_100g: num.nullable(),
  kcal_100g: num.nullable(),
  source_type: z.enum(["manual", "manufacturer", "estimated", "mext"]),
  source_ref: text,
  source_version: z.string().max(150),
  energy_basis: z.string().min(1).max(150),
  serving: foodServingSchema.optional(),
  portions: z
    .array(
      z.object({ id, label: z.string().trim().min(1).max(50), grams: amount }),
    )
    .max(20),
});
const meal = z
  .object({
    id,
    food_id: id.nullable(),
    food_name_snapshot: z.string().min(1).max(150),
    consumed_at: z.iso.datetime({ offset: true }),
    local_date: z.iso.date(),
    meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    ...amountFields,
    protein_g: snap,
    fat_g: snap,
    carbs_g: snap,
    calories_kcal: snap,
    source_snapshot: z.object({
      source_type: z.string().max(50).optional(),
      source_ref: text.optional(),
    }),
  })
  .refine(hasOneAmount);
const dataSchema = z.object({
  user_id: id,
  foods: z.array(food).max(10000),
  meals: z.array(meal).max(100000),
  targets: z
    .array(
      z.object({
        id,
        effective_from: z.iso.date(),
        protein_g: num,
        fat_g: num,
        carbs_g: num,
        calories_kcal: num,
      }),
    )
    .min(1)
    .max(10000),
  favorites: z.array(id).max(10000),
  templates: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(100),
        items: z
          .array(
            z.object({ food_id: id, ...amountFields }).refine(hasOneAmount),
          )
          .max(50),
      }),
    )
    .max(10000),
});
function unique(values: string[]) {
  return new Set(values).size === values.length;
}
export function validateData(input: unknown): TrackerData {
  const parsed = dataSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("バックアップの形式・数値が正しくありません。");
  const d = parsed.data;
  for (const rows of [d.foods, d.meals, d.targets, d.templates])
    if (!unique(rows.map((r) => r.id)))
      throw new Error("バックアップに重複したIDがあります。");
  if (!unique(d.targets.map((t) => t.effective_from)) || !unique(d.favorites))
    throw new Error("バックアップに重複した設定があります。");
  const foods = new Set(d.foods.map((f) => f.id));
  if (
    d.favorites.some((x) => !foods.has(x)) ||
    d.templates.some((t) => t.items.some((i) => !foods.has(i.food_id))) ||
    d.meals.some((m) => m.food_id !== null && !foods.has(m.food_id))
  )
    throw new Error("バックアップに参照先がない食品があります。");
  if (d.meals.some((m) => localDate(m.consumed_at) !== m.local_date))
    throw new Error("記録日時と集計日が一致しません。");
  for (const f of d.foods) {
    if (!f.serving) {
      if (keys.some((k) => f[`${k}_100g`] === null))
        throw new Error("グラム基準の食品には100gあたりの栄養値が必要です。");
      continue;
    }
    const expected = f.serving.grams
      ? per100g(f.serving, f.serving.grams)
      : null;
    if (
      keys.some((k) =>
        expected
          ? Number(expected[k]) !== f[`${k}_100g`]
          : f[`${k}_100g`] !== null,
      )
    )
      throw new Error("食品の基準の分量と栄養値が一致しません。");
  }
  if (
    d.foods.some(
      (f) =>
        !unique(f.portions.map((p) => p.id)) ||
        !unique(f.portions.map((p) => p.label)),
    )
  )
    throw new Error("ポーションのID・名前が重複しています。");
  return { ...d, foods: d.foods.map((f) => ({ ...f, owner_id: d.user_id })) };
}
export function encodeBackup(data: TrackerData): string {
  const text = JSON.stringify(
    {
      format: "pfc-tracker",
      version:
        data.foods.some((f) => f.serving) ||
        data.meals.some((m) => m.serving) ||
        data.templates.some((t) => t.items.some((i) => i.serving))
          ? 2
          : 1,
      exported_at: new Date().toISOString(),
      data: validateData(data),
    },
    null,
    2,
  );
  if (new TextEncoder().encode(text).byteLength > 20 * 1024 * 1024)
    throw new Error("バックアップが20MBを超えています。");
  return text;
}
export function decodeBackup(text: string): TrackerData {
  if (new TextEncoder().encode(text).byteLength > 20 * 1024 * 1024)
    throw new Error("バックアップは20MB以下にしてください。");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSONファイルを読み込めませんでした。");
  }
  const wrapper = z
    .object({
      format: z.literal("pfc-tracker"),
      version: z.union([z.literal(1), z.literal(2)]),
      exported_at: z.iso.datetime({ offset: true }),
      data: z.unknown(),
    })
    .safeParse(raw);
  if (!wrapper.success)
    throw new Error("PFC Trackerの対応するバックアップではありません。");
  return validateData(wrapper.data.data);
}
