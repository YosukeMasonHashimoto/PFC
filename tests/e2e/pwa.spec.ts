import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

async function addFood(page: import("@playwright/test").Page, name: string) {
  await page
    .getByRole("button", { name: "食品を登録", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("食品名", { exact: true }).fill(name);
  for (const [label, value] of [
    ["たんぱく質 (g)", "10"],
    ["脂質 (g)", "5"],
    ["炭水化物 (g)", "20"],
    ["カロリー (kcal)", "170"],
  ])
    await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog).not.toBeVisible();
}
async function ready(page: import("@playwright/test").Page) {
  await page.goto("/settings");
  await expect(page.locator(".pwa-readiness")).toHaveText(
    "オフライン準備完了",
    { timeout: 20000 },
  );
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}
test("installed shell starts cold offline, navigates every screen and persists new meals", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.goto("/foods");
  await addFood(page, "オフライン起動用テスト食品");
  await context.setOffline(true);
  // Reload the whole document: no server, client router cache or already-loaded JS may be required.
  await page.reload({ waitUntil: "load" });
  await expect(
    page.getByRole("heading", { name: "食品ライブラリ" }),
  ).toBeVisible();
  await expect(page.locator(".food-card")).toContainText(
    "オフライン起動用テスト食品",
  );
  await page.getByRole("button", { name: "記録", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("記録日時（日本時間）")
    .fill("2026-10-26T00:00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存する" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  for (const [label, heading] of [
    ["ホーム", "今日の栄養"],
    ["履歴", "記録を振り返る"],
    ["設定", "目標と設定"],
    ["食品", "食品ライブラリ"],
  ]) {
    await page
      .locator(".bottom-nav")
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "オフライン" }),
    ).toBeVisible();
  }
  const restarted = await context.newPage();
  await restarted.goto("http://127.0.0.1:3100/history");
  await restarted.getByLabel("表示日").fill("2026-10-26");
  await expect(restarted.locator(".meal-row")).toContainText("P 10");
  await restarted.screenshot({
    path: "test-results/iphone-offline.png",
    fullPage: true,
  });
  await context.setOffline(false);
});
test("iPhone metadata, installation guide, readable inputs and landscape safe layout", async ({
  page,
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    id: "/",
    scope: "/",
    display: "standalone",
    start_url: "/",
  });
  await ready(page);
  await expect(
    page.getByText("共有ボタンから「ホーム画面に追加」を選ぶ"),
  ).toBeVisible();
  expect(
    await page.locator('meta[name="viewport"]').getAttribute("content"),
  ).toContain("viewport-fit=cover");
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  await expect(
    page.locator('meta[name="mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/icons/apple-touch-icon.png",
  );
  await page.goto("/foods");
  await page
    .getByRole("button", { name: "食品を登録", exact: true })
    .first()
    .click();
  expect(
    await page
      .getByRole("dialog")
      .getByLabel("食品名", { exact: true })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "キャンセル" })
    .click();
  for (const size of [
    { width: 375, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test("standalone mode and iPhone file sharing preserve user activation and handle cancel", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: () => true,
      configurable: true,
    });
    let calls = 0;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        calls++;
        if (calls === 2) throw new DOMException("cancel", "AbortError");
        const active = navigator.userActivation?.isActive ?? null;
        const file = data.files![0];
        (window as Window & { __shared?: unknown }).__shared = {
          name: file.name,
          type: file.type,
          active,
          backup: JSON.parse(await file.text()),
        };
      },
    });
  });
  await ready(page);
  await expect(page.getByText("ホーム画面版で利用中")).toBeVisible();
  await page.getByRole("button", { name: "ファイルに保存・共有" }).click();
  const shared = await page.evaluate(
    () =>
      (
        window as Window & {
          __shared?: {
            name: string;
            type: string;
            active: boolean | null;
            backup: { format: string; version: number };
          };
        }
      ).__shared,
  );
  expect(shared?.name).toMatch(/^pfc-tracker-\d{4}-\d{2}-\d{2}\.json$/);
  expect(shared?.type).toBe("application/json");
  expect(shared?.backup).toMatchObject({ format: "pfc-tracker", version: 1 });
  expect(shared?.active).not.toBe(false);
  await page.getByRole("button", { name: "ファイルに保存・共有" }).click();
  await expect(page.getByRole("status")).toContainText(
    "共有をキャンセルしました",
  );
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});
test("new service worker waits for confirmation and keeps IndexedDB through update", async ({
  page,
}) => {
  await ready(page);
  await page.goto("/foods");
  await addFood(page, "更新後も保持するテスト食品");
  await page.goto("/settings");
  const original = await readFile("public/sw.js", "utf8");
  const modified = original.replace(
    /"version":"([^"]+)"/,
    '"version":"$1-update-test"',
  );
  expect(modified).not.toBe(original);
  try {
    await writeFile("public/sw.js", modified);
    await page.evaluate(async () => {
      (window as Window & { __beforeUpdate?: boolean }).__beforeUpdate = true;
      const registration = await navigator.serviceWorker.getRegistration();
      await registration!.update();
    });
    await expect(
      page.getByRole("button", { name: "更新して再起動" }),
    ).toBeVisible({ timeout: 20000 });
    expect(
      await page.evaluate(
        () => (window as Window & { __beforeUpdate?: boolean }).__beforeUpdate,
      ),
    ).toBe(true);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "更新して再起動" }).click();
    await expect(page.locator(".pwa-readiness")).toHaveText(
      "オフライン準備完了",
      { timeout: 20000 },
    );
    await page.goto("/foods");
    await expect(page.locator(".food-card")).toContainText(
      "更新後も保持するテスト食品",
    );
  } finally {
    await writeFile("public/sw.js", original);
  }
});
