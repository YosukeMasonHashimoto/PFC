import { z } from "zod";
const numeric = z.union([z.number(), z.string().trim().min(1)]);
const num = numeric
  .transform(Number)
  .pipe(z.number().finite().min(0).max(100000));
const positive = numeric
  .transform(Number)
  .pipe(z.number().finite().gt(0).max(100000));
const id = z.uuid();
export const nutrients = { protein: num, fat: num, carbs: num, kcal: num };
export const servingUnit = z.enum(["食", "個", "杯"]);
export const servingSchema = z.object({
  unit: servingUnit,
  quantity: positive,
});
export const foodServingSchema = z.object({
  unit: servingUnit,
  grams: positive.optional(),
  ...nutrients,
});
export const amountFields = {
  amount_g: positive.optional(),
  serving: servingSchema.optional(),
};
export const hasOneAmount = (x: { amount_g?: number; serving?: unknown }) =>
  (x.amount_g !== undefined) !== (x.serving !== undefined);
export const foodSchema = z
  .object({
    id: id.optional(),
    name: z.string().trim().min(1).max(150),
    brand: z.string().trim().max(150).default(""),
    ...nutrients,
    serving: foodServingSchema.optional(),
    source_type: z.enum(["manual", "manufacturer", "estimated", "mext"]),
    source_ref: z.string().max(1000),
    source_version: z.string().max(150),
    energy_basis: z.string().min(1).max(150),
    portions: z
      .array(
        z.object({ label: z.string().trim().min(1).max(50), grams: positive }),
      )
      .max(20),
  })
  .refine(
    (x) => new Set(x.portions.map((p) => p.label)).size === x.portions.length,
    "ポーション名の重複があります",
  );
export const mealSchema = z
  .object({
    id: id.optional(),
    food_id: id.nullable(),
    ...amountFields,
    consumed_at: z.iso.datetime({ offset: true }),
    meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  })
  .refine(hasOneAmount, "重量または個数のどちらか一方を指定してください");
export const targetSchema = z.object({
  ...nutrients,
  effective_from: z.iso.date(),
});
export const templateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  items: z
    .array(z.object({ food_id: id, ...amountFields }).refine(hasOneAmount))
    .min(1)
    .max(50),
});
export const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("food"), data: foodSchema }),
  z.object({ action: z.literal("meal"), data: mealSchema }),
  z.object({ action: z.literal("target"), data: targetSchema }),
  z.object({ action: z.literal("template"), data: templateSchema }),
  z.object({ action: z.literal("delete_meal"), data: z.object({ id }) }),
  z.object({ action: z.literal("delete_food"), data: z.object({ id }) }),
  z.object({ action: z.literal("delete_template"), data: z.object({ id }) }),
  z.object({
    action: z.literal("favorite"),
    data: z.object({ food_id: id, enabled: z.boolean() }),
  }),
  z.object({
    action: z.literal("apply_template"),
    data: z.object({
      id,
      consumed_at: z.iso.datetime({ offset: true }),
      meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    }),
  }),
]);
