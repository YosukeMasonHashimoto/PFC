import { describe, it, expect } from "vitest";
import { initialData, applyMutation } from "../src/lib/local-data";
import { mergeData, mergeInitial } from "../src/lib/sync-model";
import {
  newSyncCode,
  parseSyncCode,
  encryptSync,
  decryptSync,
  syncProof,
} from "../src/lib/sync-crypto";
const food = {
  name: "架空食品",
  protein: 10,
  fat: 5,
  carbs: 20,
  kcal: 170,
  brand: "",
  source_type: "manual",
  source_ref: "",
  source_version: "",
  energy_basis: "test",
  portions: [],
};
function add(d: ReturnType<typeof initialData>, name: string) {
  return applyMutation(d, "food", { ...food, name });
}
describe("encrypted sync and offline merging", () => {
  it("round-trips encrypted records and rejects tampering or wrong keys", async () => {
    const d = add(initialData(), "暗号化テスト食品"),
      code = newSyncCode(),
      cipher = await encryptSync(code, d);
    expect(cipher).not.toContain("暗号化テスト食品");
    expect(await decryptSync(code, cipher)).toEqual(d);
    const other = newSyncCode();
    await expect(decryptSync(other, cipher)).rejects.toThrow();
    await expect(
      decryptSync(code, cipher.slice(0, -3) + "abc"),
    ).rejects.toThrow();
    expect(await syncProof(code)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("uses high-entropy independent pairing codes and validates malformed codes", () => {
    expect(newSyncCode()).not.toBe(newSyncCode());
    expect(() => parseSyncCode("123456")).toThrow();
  });
  it("preserves offline edits and independent remote additions", () => {
    const base = initialData(),
      local = add(base, "スマホ"),
      remote = add(base, "PC"),
      merged = mergeData(base, local, remote);
    expect(merged.foods.map((f) => f.name).sort()).toEqual(["PC", "スマホ"]);
  });
  it("propagates deletes and retains meal snapshots when the referenced food disappears", () => {
    let base = add(initialData(), "削除される食品");
    base = applyMutation(base, "meal", {
      food_id: base.foods[0].id,
      amount_g: 100,
      consumed_at: "2026-10-26T00:00:00Z",
      meal_type: "breakfast",
    });
    const remote = applyMutation(base, "delete_food", { id: base.foods[0].id });
    const merged = mergeData(base, base, remote);
    expect(merged.meals[0]).toMatchObject({ food_id: null, protein_g: 10 });
    expect(merged.foods).toHaveLength(0);
    expect(mergeData(base, remote, base).foods).toHaveLength(0);
  });
  it("keeps the later syncing row edit and merges effective target dates without duplicates", () => {
    const base = add(initialData(), "元"),
      local = applyMutation(base, "food", {
        ...food,
        id: base.foods[0].id,
        name: "スマホ変更",
      }),
      remote = applyMutation(base, "food", {
        ...food,
        id: base.foods[0].id,
        name: "PC変更",
      });
    expect(mergeData(base, local, remote).foods[0].name).toBe("スマホ変更");
    const target = {
      effective_from: "2026-10-26",
      protein: 120,
      fat: 70,
      carbs: 300,
      kcal: 2400,
    };
    const a = applyMutation(base, "target", target),
      b = applyMutation(base, "target", { ...target, protein: 130 });
    expect(
      mergeData(base, a, b).targets.filter(
        (t) => t.effective_from === "2026-10-26",
      ),
    ).toHaveLength(1);
  });
  it("pairs by adding local-only records without replacing cloud versions of common IDs", () => {
    const common = add(initialData(), "元"),
      cloud = applyMutation(common, "food", {
        ...food,
        id: common.foods[0].id,
        name: "クラウド変更",
      }),
      local = add(common, "ローカルのみ");
    const merged = mergeInitial(local, cloud);
    expect(merged.foods.map((f) => f.name).sort()).toEqual([
      "クラウド変更",
      "ローカルのみ",
    ]);
    expect(local.foods[0].name).toBe("元");
  });
  it("rebases edits made while a sync request is in flight instead of discarding them", () => {
    const sent = initialData(),
      cloud = add(sent, "リモート"),
      latest = add(sent, "通信中の追加");
    expect(mergeData(sent, latest, cloud).foods).toHaveLength(2);
  });
});
