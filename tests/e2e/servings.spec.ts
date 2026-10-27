import { test, expect, type Page } from "@playwright/test";
async function openFood(page: Page, name: string) {
  await page.goto("/foods");
  await page
    .getByRole("button", { name: "食品を登録", exact: true })
    .first()
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("食品名", { exact: true }).fill(name);
  for (const [label, value] of [
    ["たんぱく質 (g)", "20"],
    ["脂質 (g)", "15"],
    ["炭水化物 (g)", "90"],
    ["カロリー (kcal)", "600"],
  ])
    await d.getByLabel(label, { exact: true }).fill(value);
  return d;
}
for (const unit of ["食", "個", "杯"]) {
  test(`weight unknown: register, record, reload and edit by ${unit}`, async ({
    page,
  }, testInfo) => {
    const name = `架空の外食テスト（1${unit}）`;
    const d = await openFood(page, name);
    await d.getByLabel("基準の分量 (g)", { exact: true }).fill("");
    await d.getByRole("button", { name: "保存する" }).click();
    await expect(d.getByRole("alert")).toContainText("いずれか");
    await d.getByLabel("1食・1個・1杯基準", { exact: true }).selectOption(unit);
    await expect(d.getByLabel("基準の分量 (g)", { exact: true })).toHaveValue(
      "",
    );
    if (unit === "杯")
      await page.screenshot({ path: testInfo.outputPath("food-by-bowl.png") });
    await d.getByRole("button", { name: "保存する" }).click();
    await expect(d).not.toBeVisible();
    await expect(page.locator(".food-energy")).toContainText(
      `600 kcal / 1${unit}`,
    );
    await page.reload();
    await expect(page.locator(".food-energy")).toContainText(
      `600 kcal / 1${unit}`,
    );
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await expect(d.getByLabel("基準の分量 (g)", { exact: true })).toHaveValue(
      "",
    );
    await expect(
      d.getByLabel("1食・1個・1杯基準", { exact: true }),
    ).toHaveValue(unit);
    await expect(d.getByLabel("カロリー (kcal)", { exact: true })).toHaveValue(
      "600",
    );
    await d.getByRole("button", { name: "保存する" }).click();
    await expect(d).not.toBeVisible();
    await page.getByRole("button", { name: "記録", exact: true }).click();
    await expect(d.getByLabel("単位", { exact: true })).toHaveValue(
      `serving:${unit}`,
    );
    await expect(
      d.getByLabel("単位", { exact: true }).locator('option[value="g"]'),
    ).toHaveCount(0);
    await d.getByLabel("分量", { exact: true }).fill("0.5");
    await expect(d.locator(".nutrition-preview")).toContainText(
      `0.5${unit} · 300 kcal`,
    );
    await d.getByRole("button", { name: "保存する" }).click();
    await expect(d).not.toBeVisible();
    const guide = page.getByRole("region", {
      name: "今日の目標まで、あとどれくらい？",
    });
    await expect(guide.locator(".guide-suggestions")).toContainText(
      `0.5${unit}`,
    );
    await page
      .locator(".bottom-nav")
      .getByRole("link", { name: "ホーム", exact: true })
      .click();
    await expect(page.locator(".meal-row")).toContainText(`0.5${unit}`);
    await page
      .getByRole("button", { name: `${name}を編集`, exact: true })
      .click();
    await expect(d.getByLabel("分量", { exact: true })).toHaveValue("0.5");
    await expect(d.getByLabel("単位", { exact: true })).toHaveValue(
      `serving:${unit}`,
    );
    await d.getByLabel("分量", { exact: true }).fill("1");
    await expect(d.locator(".nutrition-preview")).toContainText(
      `1${unit} · 600 kcal`,
    );
    await d.getByRole("button", { name: "保存する" }).click();
    await expect(d).not.toBeVisible();
    await page.reload();
    await expect(page.locator(".meal-row")).toContainText(`1${unit}`);
    await expect(page.locator(".meal-row")).toContainText("600 kcal");
    if (unit === "杯") {
      await page
        .getByRole("button", { name: "テンプレートを作成", exact: true })
        .last()
        .click();
      await d.getByLabel("テンプレート名").fill("外食の半分セット");
      await d.getByLabel("追加する食品").selectOption({ label: name });
      await d.getByLabel("分量 (杯)", { exact: true }).fill("0.5");
      await d.getByRole("button", { name: "組み合わせに追加" }).click();
      await expect(d.locator(".template-row")).toContainText("0.5杯");
      await d.getByRole("button", { name: "保存する" }).click();
      await expect(d).not.toBeVisible();
      await page
        .getByRole("button", { name: "外食の半分セット 1 品目" })
        .click();
      await expect(d).toContainText("0.5杯");
      await d.getByRole("button", { name: "まとめて記録" }).click();
      await expect(d).not.toBeVisible();
      await expect(page.locator(".meal-row")).toHaveCount(2);
      await expect(
        page.locator(".meal-row").filter({ hasText: "0.5杯" }),
      ).toContainText("300 kcal");
      await page.screenshot({
        path: testInfo.outputPath("bowl-meals-and-suggestions.png"),
        fullPage: true,
      });
    }
  });
}
test("known serving weight allows both grams and counts without changing old gram records", async ({
  page,
}) => {
  const d = await openFood(page, "架空の重量あり食品");
  await d.getByLabel("基準の分量 (g)", { exact: true }).fill("150");
  await d.getByLabel("1食・1個・1杯基準", { exact: true }).selectOption("個");
  await expect(d.getByLabel("基準の分量 (g)", { exact: true })).toHaveValue(
    "150",
  );
  await d.getByRole("button", { name: "保存する" }).click();
  await expect(d).not.toBeVisible();
  await page.getByRole("button", { name: "記録", exact: true }).click();
  await expect(d.locator(".nutrition-preview")).toContainText("1個 · 600 kcal");
  await d.getByLabel("単位", { exact: true }).selectOption("g");
  await d.getByLabel("分量", { exact: true }).fill("75");
  await expect(d.locator(".nutrition-preview")).toContainText(
    "75 g · 300 kcal",
  );
  await d.getByRole("button", { name: "保存する" }).click();
  await expect(d).not.toBeVisible();
  await page
    .locator(".bottom-nav")
    .getByRole("link", { name: "ホーム", exact: true })
    .click();
  await expect(page.locator(".meal-row")).toContainText("75 g");
  await page
    .getByRole("button", { name: "架空の重量あり食品を編集", exact: true })
    .click();
  await expect(d.getByLabel("単位", { exact: true })).toHaveValue("g");
  await expect(d.getByLabel("分量", { exact: true })).toHaveValue("75");
  await expect(d.locator(".nutrition-preview")).toContainText(
    "75 g · 300 kcal",
  );
});
