export type ServingUnit = "食" | "個" | "杯";
export type Serving = { unit: ServingUnit; quantity: number };
export type FoodAmount = { amount_g?: number; serving?: Serving };
export type FoodServing = {
  unit: ServingUnit;
  grams?: number;
  protein: number;
  fat: number;
  carbs: number;
  kcal: number;
};
export type Portion = { id: string; label: string; grams: number };
export type Food = {
  id: string;
  owner_id: string | null;
  name: string;
  brand: string;
  protein_100g: number | null;
  fat_100g: number | null;
  carbs_100g: number | null;
  kcal_100g: number | null;
  source_type: "manual" | "manufacturer" | "estimated" | "mext";
  source_ref: string;
  source_version: string;
  energy_basis: string;
  portions: Portion[];
  serving?: FoodServing;
};
export type Meal = {
  id: string;
  food_id: string | null;
  food_name_snapshot: string;
  consumed_at: string;
  local_date: string;
  meal_type: string;
  amount_g?: number;
  serving?: Serving;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  calories_kcal: number;
  source_snapshot: { source_type?: string; source_ref?: string };
};
export type Target = {
  id: string;
  effective_from: string;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  calories_kcal: number;
};
export type Template = {
  id: string;
  name: string;
  items: ({ food_id: string } & FoodAmount)[];
};
export type TrackerData = {
  user_id: string;
  foods: Food[];
  meals: Meal[];
  targets: Target[];
  favorites: string[];
  templates: Template[];
};
