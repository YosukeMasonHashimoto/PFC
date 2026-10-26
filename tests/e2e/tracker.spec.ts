import { test, expect } from "@playwright/test";
test("mobile UI: auth protection, food, pack, snapshot, targets, history and templates", async ({
  page,
  request,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  expect((await request.get("/api/data")).status()).toBe(401);
  const csrf = await request.post("/api/data", {
    headers: { Origin: "https://attacker.invalid" },
    data: {
      action: "delete_meal",
      data: { id: "11111111-1111-4111-8111-111111111111" },
    },
  });
  expect(csrf.status()).toBe(403);
  // Test-only auth adapter: hosted email delivery and token validation are not simulated successes.
  await page.goto("/auth/confirm?token_hash=test-only&type=email");
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
  await expect(page.getByRole("status")).toContainText("保存しました");
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
      (path) => path.startsWith("/icons/") || path === "/offline.html",
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
  await page
    .locator(".bottom-nav")
    .getByRole("link", { name: "設定", exact: true })
    .click();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(pageErrors).toEqual([]);
});
