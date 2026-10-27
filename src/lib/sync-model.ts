import { validateData } from "./local-data";
import type { TrackerData } from "./types";
export type SyncConfig = {
  code: string;
  base: TrackerData;
  revision: number;
  recovery?: TrackerData;
};
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
/** Three-way merge: independent rows survive; edits to the same row prefer the later syncing device. */
export function mergeData(
  base: TrackerData,
  local: TrackerData,
  remote: TrackerData,
): TrackerData {
  function rows<T>(b: T[], l: T[], r: T[], key: (x: T) => string): T[] {
    const bm = new Map(b.map((x) => [key(x), x])),
      lm = new Map(l.map((x) => [key(x), x])),
      result = new Map(r.map((x) => [key(x), x]));
    for (const [id, value] of bm)
      if (!lm.has(id)) result.delete(id);
      else if (!equal(value, lm.get(id))) result.set(id, lm.get(id)!);
    for (const [id, value] of lm) if (!bm.has(id)) result.set(id, value);
    return [...result.values()];
  }
  const foods = rows(base.foods, local.foods, remote.foods, (x) => x.id),
    ids = new Set(foods.map((f) => f.id));
  const favorites = new Set(remote.favorites);
  for (const id of base.favorites)
    if (!local.favorites.includes(id)) favorites.delete(id);
  for (const id of local.favorites)
    if (!base.favorites.includes(id)) favorites.add(id);
  const data: TrackerData = {
    user_id: remote.user_id,
    foods,
    meals: rows(base.meals, local.meals, remote.meals, (x) => x.id)
      .map((m) =>
        m.food_id && !ids.has(m.food_id) ? { ...m, food_id: null } : m,
      )
      .sort((a, b) => Date.parse(b.consumed_at) - Date.parse(a.consumed_at)),
    targets: rows(
      base.targets,
      local.targets,
      remote.targets,
      (x) => x.effective_from,
    ).sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
    templates: rows(
      base.templates,
      local.templates,
      remote.templates,
      (x) => x.id,
    ).map((t) => ({ ...t, items: t.items.filter((i) => ids.has(i.food_id)) })),
    favorites: [...favorites].filter((id) => ids.has(id)),
  };
  return validateData(data);
}
/** Pairing imports only local-only rows; shared IDs and target dates use the existing cloud version. */
export function mergeInitial(
  local: TrackerData,
  remote: TrackerData,
): TrackerData {
  const base = structuredClone(local);
  base.foods = local.foods.filter((l) =>
    remote.foods.some((r) => r.id === l.id),
  );
  base.meals = local.meals.filter((l) =>
    remote.meals.some((r) => r.id === l.id),
  );
  base.templates = local.templates.filter((l) =>
    remote.templates.some((r) => r.id === l.id),
  );
  base.targets = local.targets.filter((l) =>
    remote.targets.some((r) => r.effective_from === l.effective_from),
  );
  base.favorites = [];
  return mergeData(base, local, remote);
}
export const sameData = equal;
