import { test, expect, type Page } from "@playwright/test";
async function addFood(page: Page, name: string) {
  await page.goto("http://127.0.0.1:3100/foods");
  await page
    .getByRole("button", { name: "食品を登録", exact: true })
    .first()
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("食品名", { exact: true }).fill(name);
  for (const label of [
    "たんぱく質 (g)",
    "脂質 (g)",
    "炭水化物 (g)",
    "カロリー (kcal)",
  ])
    await d.getByLabel(label, { exact: true }).fill("10");
  await d.getByRole("button", { name: "保存する" }).click();
  await expect(d).not.toBeVisible();
}
test("paired independent browsers automatically sync in both directions and merge offline edits", async ({
  page,
  context,
  browser,
}) => {
  await addFood(page, "スマホの食品");
  await page.goto("/settings");
  await expect(page.locator(".pwa-readiness")).toHaveText("オフライン準備完了");
  await page.getByRole("button", { name: "この端末から同期を開始" }).click();
  await expect(page.getByText("この端末は連携済みです。")).toBeVisible();
  await page.getByText("別の端末を連携する", { exact: true }).click();
  const code = await page
    .getByLabel("同期コード", { exact: true })
    .inputValue();
  const pc = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    other = await pc.newPage();
  try {
    await addFood(other, "PCの食品");
    await other.goto("http://127.0.0.1:3100/settings");
    await other.getByLabel("連携する同期コード").fill(code);
    await other
      .getByRole("button", { name: "この端末を連携", exact: true })
      .click();
    await expect(other.getByText("この端末は連携済みです。")).toBeVisible();
    await page.goto("/foods");
    await expect(
      page.getByRole("heading", { name: "PCの食品", exact: true }),
    ).toBeVisible({ timeout: 22000 });
    await other.goto("http://127.0.0.1:3100/foods");
    await expect(
      other.getByRole("heading", { name: "スマホの食品", exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    await addFood(page, "スマホのオフライン追加");
    await addFood(other, "PCのオンライン追加");
    await expect(other.locator(".sync-status")).toHaveText(
      "端末間の自動同期が有効です",
      { timeout: 15000 },
    );
    await context.setOffline(false);
    await expect(
      page.getByRole("heading", { name: "PCのオンライン追加", exact: true }),
    ).toBeVisible({ timeout: 22000 });
    await expect(
      other.getByRole("heading", {
        name: "スマホのオフライン追加",
        exact: true,
      }),
    ).toBeVisible({ timeout: 22000 });
    await page.reload();
    await expect(page.locator(".food-card")).toHaveCount(4);
    await other.reload();
    await expect(other.locator(".food-card")).toHaveCount(4);
  } finally {
    await context.setOffline(false);
    await pc.close();
  }
});
