import { test, expect } from "@playwright/test";
test("login-free mobile UI: local persistence, food, pack, snapshots, history and templates", async ({
  page,
  request,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("supabase"))
      externalRequests.push(request.url());
  });
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  expect((await request.get("/api/data")).status()).toBe(410);
  await expect(page.getByRole("heading", { name: "今日の栄養" })).toBeVisible();
  await page
    .locator(".bottom-nav")
    .getByRole("link", { name: "食品", exact: true })
    .click();
  await page
    .getByRole("button", { name: "食品を登録", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("食品名", { exact: true })
    .fill("ご飯（炊飯後・架空テスト）");
  await dialog.getByLabel("たんぱく質 (g)", { exact: true }).fill("10");
  await dialog.getByLabel("脂質 (g)", { exact: true }).fill("5");
  await dialog.getByLabel("炭水化物 (g)", { exact: true }).fill("20");
  await dialog.getByLabel("カロリー (kcal)", { exact: true }).fill("170");
  await dialog.getByLabel("出典の種類").selectOption("estimated");
  await dialog.getByLabel("出典 URL").fill("架空のE2Eテスト値。本番使用不可");
  await dialog.getByRole("button", { name: "ポーションを追加" }).click();
  await dialog.getByLabel("単位名").fill("1パック");
  await dialog.getByLabel("重量 (g)", { exact: true }).fill("150");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "ご飯（炊飯後・架空テスト）のお気に入り切替" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "このブラウザに保存しました",
  );
  await page.getByRole("button", { name: "記録", exact: true }).click();
  await dialog
    .getByLabel("単位", { exact: true })
    .selectOption({ label: "1パック (150g)" });
  await dialog.getByLabel("分量").fill("1");
  await expect(dialog.locator(".nutrition-preview")).toContainText("255 kcal");
  await dialog.getByLabel("記録日時（日本時間）").fill("2026-10-26T00:00");
  await dialog.getByLabel("食事区分").selectOption("breakfast");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "最近使った食品" }).click();
  await expect(
    page.getByRole("heading", {
      name: "ご飯（炊飯後・架空テスト）",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await dialog.getByLabel("たんぱく質 (g)", { exact: true }).fill("50");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .locator(".bottom-nav")
    .getByRole("link", { name: "履歴", exact: true })
    .click();
  await page.getByLabel("表示日").fill("2026-10-26");
  await expect(page.locator(".meal-row")).toContainText("P 15");
  await page
    .getByRole("button", { name: "ご飯（炊飯後・架空テスト）を編集" })
    .click();
  await dialog.getByLabel("記録日時（日本時間）").fill("2026-10-25T23:59");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".meal-row")).toHaveCount(0);
  await page.getByLabel("表示日").fill("2026-10-25");
  await expect(page.locator(".meal-row")).toContainText("P 15");
  await page
    .getByRole("button", { name: "テンプレートを作成", exact: true })
    .last()
    .click();
  await dialog.getByLabel("テンプレート名").fill("テストの組み合わせ");
  await dialog
    .getByLabel("追加する食品")
    .selectOption({ label: "ご飯（炊飯後・架空テスト）" });
  await dialog.getByLabel("重量 (g)", { exact: true }).fill("100");
  await dialog.getByRole("button", { name: "組み合わせに追加" }).click();
  await dialog.getByLabel("重量 (g)", { exact: true }).fill("300");
  await dialog.getByRole("button", { name: "組み合わせに追加" }).click();
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "テストの組み合わせ 2 品目" }).click();
  await dialog.getByLabel("記録日時（日本時間）").fill("2026-10-25T12:00");
  await dialog.getByRole("button", { name: "まとめて記録" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".meal-row")).toHaveCount(3);
  await page
    .locator(".bottom-nav")
    .getByRole("link", { name: "設定", exact: true })
    .click();
  await page.getByLabel("適用開始日").fill("2026-10-26");
  await page.getByLabel("たんぱく質 (g)", { exact: true }).fill("120");
  await page.getByRole("button", { name: "目標を保存" }).click();
  await expect(page.getByText("2026-10-26 から")).toBeVisible();
  await page
    .locator(".bottom-nav")
    .getByRole("link", { name: "ホーム", exact: true })
    .click();
  await page.getByLabel("表示日").fill("2026-10-26");
  await expect(page.getByText("/ 120 g", { exact: false })).toBeVisible();
  await page.getByLabel("表示日").fill("2026-10-25");
  await expect(page.getByText("/ 107 g", { exact: false })).toBeVisible();
  await page
    .locator(".meal-group")
    .first()
    .getByRole("button", { name: "食品を追加" })
    .click();
  await expect(dialog.getByLabel("食事区分")).toHaveValue("breakfast");
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  // Check layout while browser timezone is deliberately not JST.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".sidebar")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/desktop-dashboard.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const names = await caches.keys();
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (req) => new URL(req.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(
    cached.every(
      (path) =>
        path.startsWith("/icons/") ||
        path.startsWith("/_next/static/") ||
        [
          "/",
          "/foods",
          "/history",
          "/settings",
          "/manifest.webmanifest",
          "/offline.html",
        ].includes(path),
    ),
  ).toBe(true);
  const manifest = await request.get("/manifest.webmanifest");
  expect((await manifest.json()).icons).toHaveLength(3);
  await page
    .locator(".bottom-nav")
    .getByRole("link", { name: "食品", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".food-card")
    .getByRole("button", {
      name: "ご飯（炊飯後・架空テスト）を削除",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "食品が見つかりません" }),
  ).toBeVisible();
  await page
    .locator(".bottom-nav")
    .getByRole("link", { name: "履歴", exact: true })
    .click();
  await page.getByLabel("表示日").fill("2026-10-25");
  await expect(page.locator(".meal-row")).toHaveCount(3);
  await page
    .getByRole("button", { name: "ご飯（炊飯後・架空テスト）を編集" })
    .first()
    .click();
  await dialog.getByLabel("記録日時（日本時間）").fill("2026-10-24T12:00");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".meal-row")).toHaveCount(2);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "ご飯（炊飯後・架空テスト）を削除" })
    .first()
    .click();
  await expect(page.locator(".meal-row")).toHaveCount(1);
  await page.reload();
  await page.getByLabel("表示日").fill("2026-10-25");
  await expect(page.locator(".meal-row")).toHaveCount(1);
  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

async function addFood(page: import("@playwright/test").Page, name: string) {
  await page
    .getByRole("button", { name: "食品を登録", exact: true })
    .first()
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("食品名", { exact: true }).fill(name);
  for (const [label, value] of [
    ["たんぱく質 (g)", "10"],
    ["脂質 (g)", "5"],
    ["炭水化物 (g)", "20"],
    ["カロリー (kcal)", "170"],
  ])
    await d.getByLabel(label, { exact: true }).fill(value);
  await d.getByRole("button", { name: "保存する" }).click();
  await expect(d).not.toBeVisible();
}
test("backup download, isolated browser and restore with invalid-file protection", async ({
  page,
  browser,
}) => {
  await page.goto("/foods");
  await addFood(page, "バックアップ用架空食品");
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
  await page.goto("/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "バックアップを書き出す" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  const other = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const fresh = await other.newPage();
  await fresh.goto("http://127.0.0.1:3100/foods");
  await expect(
    fresh.getByRole("heading", { name: "食品が見つかりません" }),
  ).toBeVisible();
  await fresh.goto("http://127.0.0.1:3100/settings");
  await fresh
    .getByLabel("バックアップを読み込む", { exact: false })
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{}"),
    });
  await expect(fresh.locator("section").getByRole("alert")).toContainText(
    "バックアップではありません",
  );
  fresh.once("dialog", (d) => d.dismiss());
  await fresh
    .getByLabel("バックアップを読み込む", { exact: false })
    .setInputFiles(file!);
  await fresh.goto("http://127.0.0.1:3100/foods");
  await expect(
    fresh.getByRole("heading", { name: "食品が見つかりません" }),
  ).toBeVisible();
  await fresh.goto("http://127.0.0.1:3100/settings");
  fresh.once("dialog", (d) => d.accept());
  await fresh
    .getByLabel("バックアップを読み込む", { exact: false })
    .setInputFiles(file!);
  await expect(fresh.getByRole("status")).toContainText(
    "バックアップを復元しました",
  );
  await fresh.goto("http://127.0.0.1:3100/history");
  await fresh.getByLabel("表示日").fill("2026-10-26");
  await expect(fresh.locator(".meal-row")).toContainText(
    "バックアップ用架空食品",
  );
  await expect(fresh.locator(".meal-row")).toContainText("P 10");
  await fresh.reload();
  await fresh.getByLabel("表示日").fill("2026-10-26");
  await expect(fresh.locator(".meal-row")).toHaveCount(1);
  await other.close();
});
test("multiple tabs preserve concurrent changes and loaded pages save without a network", async ({
  page,
  context,
}) => {
  await page.goto("/foods");
  const second = await context.newPage();
  await second.goto("http://127.0.0.1:3100/foods");
  await Promise.all([
    addFood(page, "タブA架空食品"),
    addFood(second, "タブB架空食品"),
  ]);
  await page.reload();
  await expect(page.locator(".food-card")).toHaveCount(2);
  await context.setOffline(true);
  await addFood(page, "オフライン架空食品");
  await expect(page.locator(".food-card")).toHaveCount(3);
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator(".food-card")).toHaveCount(3);
});
test("failed persistent writes never report success or replace previous data", async ({
  page,
}) => {
  await page.goto("/foods");
  await addFood(page, "保持する架空食品");
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("空き容量が不足しています", "QuotaExceededError");
    };
  });
  await page
    .getByRole("button", { name: "食品を登録", exact: true })
    .first()
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("食品名", { exact: true }).fill("保存できない食品");
  for (const label of [
    "たんぱく質 (g)",
    "脂質 (g)",
    "炭水化物 (g)",
    "カロリー (kcal)",
  ])
    await d.getByLabel(label, { exact: true }).fill("1");
  await d.getByRole("button", { name: "保存する" }).click();
  await expect(d.getByRole("alert")).toContainText("空き容量");
  await expect(d).toBeVisible();
  await page.reload();
  await expect(page.locator(".food-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "保持する架空食品" }),
  ).toBeVisible();
});
