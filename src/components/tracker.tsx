"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { AppLink as Link, PwaStatus, PwaPanel } from "@/components/pwa";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Home,
  Plus,
  Settings,
  Star,
  Utensils,
  X,
  Trash2,
  Pencil,
  Search,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  aggregate,
  portionGrams,
  calculate,
  defaults,
  keys,
  localDate,
  progress,
  type Nutrients,
} from "@/lib/nutrition";
import type { Food, Meal, TrackerData, Template } from "@/lib/types";
import { BackupControls } from "@/components/backup-controls";
import { loadLocal, mutateLocal } from "@/lib/local-store";
const labels = {
  protein: "たんぱく質",
  fat: "脂質",
  carbs: "炭水化物",
  kcal: "カロリー",
};
const mealTypes = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};
const sources = {
  manual: "手動入力",
  manufacturer: "メーカー表示",
  estimated: "推定値",
  mext: "文科省 成分表",
};
const f = (n: string | number) =>
  Number(n).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
const foodN = (x: Food): Nutrients => ({
  protein: x.protein_100g,
  fat: x.fat_100g,
  carbs: x.carbs_100g,
  kcal: x.kcal_100g,
});
const mealN = (x: Meal): Nutrients => ({
  protein: x.protein_g,
  fat: x.fat_g,
  carbs: x.carbs_g,
  kcal: x.calories_kcal,
});
type Editor =
  | { type: "food"; food?: Food }
  | { type: "meal"; food?: Food; meal?: Meal; mealType?: string }
  | { type: "template" }
  | { type: "apply"; template: Template };
export default function Tracker() {
  const path = usePathname();
  const section =
    path === "/foods"
      ? "foods"
      : path === "/history"
        ? "history"
        : path === "/settings"
          ? "settings"
          : "home";
  const [data, setData] = useState<TrackerData | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(false);
  const [date, setDate] = useState(() => localDate(new Date().toISOString())),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [editor, setEditor] = useState<Editor | null>(null);
  const busy = useRef(false);
  const load = useCallback(async () => {
    setData(await loadLocal());
    setError("");
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      load().catch((e) => setError(e.message));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        load().catch((e) => setError(e.message));
    };
    document.addEventListener("visibilitychange", refresh);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("pfc-local-updates")
        : null;
    if (channel)
      channel.onmessage = () => load().catch((e) => setError(e.message));
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      channel?.close();
    };
  }, [load]);
  async function mutate(action: string, payload: unknown) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const saved = await mutateLocal(action, payload);
      setData(saved);
      setEditor(null);
      setNotice("このブラウザに保存しました");
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("pfc-local-updates");
        channel.postMessage("saved");
        channel.close();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function shift(days: number) {
    const d = new Date(`${date}T12:00:00+09:00`);
    d.setUTCDate(d.getUTCDate() + days);
    setDate(localDate(d.toISOString()));
  }
  const dayMeals = data?.meals.filter((x) => x.local_date === date) || [];
  const totals = aggregate(dayMeals.map(mealN));
  const target = data?.targets
    .filter((x) => x.effective_from <= date)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  const goals: Nutrients = target
    ? {
        protein: target.protein_g,
        fat: target.fat_g,
        carbs: target.carbs_g,
        kcal: target.calories_kcal,
      }
    : defaults;
  const recent = [
    ...new Set(data?.meals.map((x) => x.food_id).filter(Boolean)),
  ].slice(0, 10);
  const foods =
    data?.foods
      .filter(
        (x) =>
          `${x.name} ${x.brand}`.toLowerCase().includes(query.toLowerCase()) &&
          (filter === "favorites"
            ? data.favorites.includes(x.id)
            : filter === "recent"
              ? recent.includes(x.id)
              : true),
      )
      .sort((a, b) =>
        filter === "recent"
          ? recent.indexOf(a.id) - recent.indexOf(b.id)
          : a.name.localeCompare(b.name, "ja"),
      ) || [];
  const nav = [
    { href: "/", label: "ホーム", icon: Home, key: "home" },
    { href: "/foods", label: "食品", icon: BookOpen, key: "foods" },
    { href: "/history", label: "履歴", icon: CalendarDays, key: "history" },
    { href: "/settings", label: "設定", icon: Settings, key: "settings" },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Activity size={22} />
          </span>
          PFC <span className="brand-light">Tracker</span>
        </Link>
        <p className="sidebar-caption">毎日の記録が、明日のカラダに。</p>
        <nav>
          {nav.map((n) => (
            <Link
              aria-current={section === n.key ? "page" : undefined}
              className={section === n.key ? "active" : ""}
              href={n.href}
              key={n.href}
            >
              <n.icon size={20} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="online-dot" /> このブラウザに保存
          <small>Asia/Tokyo · 日本時間</small>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span className="mobile-brand">
            <Activity size={20} /> PFC Tracker
          </span>
          <span className="desktop-kicker">YOUR DAILY NUTRITION</span>
          <span className="user-badge">自分の栄養ログ</span>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {section === "home"
                  ? "SMALL STEPS, STRONGER YOU"
                  : section === "foods"
                    ? "YOUR FOOD LIBRARY"
                    : section === "history"
                      ? "LOOK BACK & KEEP GOING"
                      : "MAKE IT YOURS"}
              </span>
              <h1>
                {
                  {
                    home: "今日の栄養",
                    foods: "食品ライブラリ",
                    history: "記録を振り返る",
                    settings: "目標と設定",
                  }[section]
                }
              </h1>
              <p>
                {
                  {
                    home: "食べたものを記録して、今日のバランスを整えましょう。",
                    foods: "いつもの食品を、すばやく記録。",
                    history: "毎日の積み重ねを確認しましょう。",
                    settings: "あなたのペースに合わせて、目標を設定。",
                  }[section]
                }
              </p>
            </div>
            {section !== "settings" && (
              <Button
                onClick={() =>
                  setEditor(
                    section === "foods" ? { type: "food" } : { type: "meal" },
                  )
                }
                disabled={!data}
              >
                <Plus size={18} />
                {section === "foods" ? "食品を登録" : "食品を記録"}
              </Button>
            )}
          </div>
          <PwaStatus />
          {error && (
            <div className="message error" role="alert">
              {error}{" "}
              <button
                onClick={() =>
                  load()
                    .then(() => setError(""))
                    .catch((e) => setError(e.message))
                }
              >
                再読み込み
              </button>
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              <Check size={18} />
              {notice}
            </div>
          )}
          {!data && error && (
            <div className="card">
              <BackupControls onRestore={load} />
            </div>
          )}
          {!data ? (
            <div className="card empty" role="status">
              {error
                ? "ブラウザの保存設定を確認して再読み込みしてください。"
                : "記録を読み込んでいます…"}
            </div>
          ) : (
            <>
              {(section === "home" || section === "history") && (
                <>
                  <div className="date-row">
                    <div className="date-picker">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="前日"
                        onClick={() => shift(-1)}
                      >
                        <ChevronLeft size={18} />
                      </Button>
                      <label className="date-label">
                        <CalendarDays size={18} />
                        <input
                          aria-label="表示日"
                          type="date"
                          value={date}
                          onChange={(e) =>
                            e.target.value && setDate(e.target.value)
                          }
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="翌日"
                        onClick={() => shift(1)}
                      >
                        <ChevronRight size={18} />
                      </Button>
                    </div>
                    <button
                      className="text-button"
                      onClick={() =>
                        setDate(localDate(new Date().toISOString()))
                      }
                    >
                      今日に戻る
                    </button>
                  </div>
                  <div className="summary-grid">
                    <section className="card calorie-card">
                      <div className="section-label">
                        <span>
                          <Flame size={18} /> 摂取カロリー
                        </span>
                        <span className="pill">DAILY ENERGY</span>
                      </div>
                      <div className="energy-number">
                        {f(totals.kcal)}
                        <span> kcal</span>
                      </div>
                      <p>目標 {f(goals.kcal)} kcal</p>
                      <Meter
                        value={totals.kcal}
                        target={goals.kcal}
                        name="カロリー"
                      />
                      <div className="energy-footer">
                        <span>
                          {progress(totals.kcal, goals.kcal).remaining < 0
                            ? "目標より超過"
                            : "目標まで残り"}
                        </span>
                        <strong>
                          {f(
                            Math.abs(
                              progress(totals.kcal, goals.kcal).remaining,
                            ),
                          )}{" "}
                          kcal
                        </strong>
                      </div>
                    </section>
                    <section className="card macros-card">
                      <div className="section-label">
                        <span>
                          <Activity size={18} /> PFCバランス
                        </span>
                        <span className="muted">摂取量 / 目標</span>
                      </div>
                      {(["protein", "fat", "carbs"] as const).map((k) => (
                        <div className={`macro macro-${k}`} key={k}>
                          <div className="macro-symbol">
                            {k === "protein" ? "P" : k === "fat" ? "F" : "C"}
                          </div>
                          <div className="macro-content">
                            <div className="macro-heading">
                              <strong>{labels[k]}</strong>
                              <span>
                                <b>{f(totals[k])}</b> / {f(goals[k])} g
                              </span>
                            </div>
                            <Meter
                              value={totals[k]}
                              target={goals[k]}
                              name={labels[k]}
                            />
                            <small>
                              {progress(totals[k], goals[k]).remaining < 0
                                ? "超過"
                                : "残り"}{" "}
                              {f(
                                Math.abs(
                                  progress(totals[k], goals[k]).remaining,
                                ),
                              )}{" "}
                              g
                            </small>
                          </div>
                        </div>
                      ))}
                    </section>
                  </div>
                  <div className="daily-caption">
                    <span>
                      <Check size={15} /> 記録時点の栄養値で集計
                    </span>
                    <span>{dayMeals.length} 件の記録 · 日本時間</span>
                  </div>
                  <div className="content-columns">
                    <section>
                      <div className="section-heading">
                        <h2>食事の記録</h2>
                        <span className="muted">{date}</span>
                      </div>
                      {Object.entries(mealTypes).map(([key, name]) => (
                        <div className="card meal-group" key={key}>
                          <div className="meal-group-head">
                            <h3>
                              <Utensils size={17} />
                              {name}
                            </h3>
                            <span>
                              {f(
                                aggregate(
                                  dayMeals
                                    .filter((m) => m.meal_type === key)
                                    .map(mealN),
                                ).kcal,
                              )}{" "}
                              <small>kcal</small>
                            </span>
                          </div>
                          {dayMeals
                            .filter((m) => m.meal_type === key)
                            .map((m) => (
                              <article className="meal-row" key={m.id}>
                                <div className="meal-detail">
                                  <strong>{m.food_name_snapshot}</strong>
                                  <small>
                                    {f(m.amount_g)} g ·{" "}
                                    {new Intl.DateTimeFormat("ja-JP", {
                                      timeZone: "Asia/Tokyo",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }).format(new Date(m.consumed_at))}{" "}
                                    {m.source_snapshot.source_type ===
                                    "estimated"
                                      ? "· 推定値"
                                      : ""}
                                  </small>
                                  <span className="mini-macros">
                                    P {f(m.protein_g)}　F {f(m.fat_g)}　C{" "}
                                    {f(m.carbs_g)}
                                  </span>
                                </div>
                                <div className="meal-actions">
                                  <strong>
                                    {f(m.calories_kcal)} <small>kcal</small>
                                  </strong>
                                  <div>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      aria-label={`${m.food_name_snapshot}を編集`}
                                      onClick={() =>
                                        setEditor({
                                          type: "meal",
                                          meal: m,
                                          food: data.foods.find(
                                            (x) => x.id === m.food_id,
                                          ),
                                        })
                                      }
                                    >
                                      <Pencil size={15} />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      disabled={pending}
                                      aria-label={`${m.food_name_snapshot}を削除`}
                                      onClick={() => {
                                        if (
                                          confirm(
                                            "この食事記録を削除しますか？",
                                          )
                                        )
                                          mutate("delete_meal", { id: m.id });
                                      }}
                                    >
                                      <Trash2 size={15} />
                                    </Button>
                                  </div>
                                </div>
                              </article>
                            ))}
                          {!dayMeals.some((m) => m.meal_type === key) && (
                            <p className="meal-empty">まだ記録がありません</p>
                          )}
                          <button
                            className="add-meal"
                            onClick={() =>
                              setEditor({ type: "meal", mealType: key })
                            }
                          >
                            <Plus size={16} />
                            食品を追加
                          </button>
                        </div>
                      ))}
                    </section>
                    <aside className="right-column">
                      <section className="card">
                        <div className="section-heading">
                          <h3>
                            <Layers size={18} /> 食事テンプレート
                          </h3>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="テンプレートを作成"
                            onClick={() => setEditor({ type: "template" })}
                          >
                            <Plus size={18} />
                          </Button>
                        </div>
                        <p className="muted">
                          いつもの組み合わせを、まとめて。
                        </p>
                        {data.templates.length === 0 && (
                          <p className="empty-small">
                            食品と分量を保存して
                            <br />
                            毎日の記録をもっと手軽に。
                          </p>
                        )}
                        {data.templates.map((t) => (
                          <div className="template-row" key={t.id}>
                            <button
                              disabled={pending}
                              onClick={() =>
                                setEditor({ type: "apply", template: t })
                              }
                            >
                              <strong>{t.name}</strong>
                              <small>{t.items.length} 品目</small>
                            </button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`${t.name}を削除`}
                              disabled={pending}
                              onClick={() => {
                                if (confirm("テンプレートを削除しますか？"))
                                  mutate("delete_template", { id: t.id });
                              }}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          className="full"
                          onClick={() => setEditor({ type: "template" })}
                        >
                          <Plus size={16} />
                          テンプレートを作成
                        </Button>
                      </section>
                      <section className="tip-card">
                        <span className="eyebrow">A LITTLE REMINDER</span>
                        <h3>完璧より、続けること。</h3>
                        <p>
                          小さな記録の積み重ねが、
                          <br />
                          自分のカラダを知るきっかけに。
                        </p>
                        <ArrowUpRight size={24} />
                      </section>
                    </aside>
                  </div>
                </>
              )}
              {section === "foods" && (
                <>
                  <div className="search-box">
                    <Search size={20} />
                    <input
                      aria-label="食品を検索"
                      placeholder="食品名・ブランドで検索"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <div className="tabs">
                    {[
                      ["all", "すべての食品"],
                      ["favorites", "お気に入り"],
                      ["recent", "最近使った食品"],
                    ].map(([key, name]) => (
                      <button
                        aria-pressed={filter === key}
                        className={filter === key ? "selected" : ""}
                        key={key}
                        onClick={() => setFilter(key)}
                      >
                        {key === "favorites" && <Star size={15} />} {name}
                      </button>
                    ))}
                  </div>
                  <p className="muted">
                    {foods.length} 件 ·
                    栄養値は100gあたり。調理前後・皮の有無は別食品として登録してください。
                  </p>
                  <div className="food-grid">
                    {foods.map((food) => (
                      <article className="card food-card" key={food.id}>
                        <div className="section-heading">
                          <span
                            className={`source-badge ${food.source_type === "estimated" ? "estimated" : ""}`}
                          >
                            {sources[food.source_type]}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`${food.name}のお気に入り切替`}
                            aria-pressed={data.favorites.includes(food.id)}
                            disabled={pending}
                            onClick={() =>
                              mutate("favorite", {
                                food_id: food.id,
                                enabled: !data.favorites.includes(food.id),
                              })
                            }
                          >
                            <Star
                              size={18}
                              fill={
                                data.favorites.includes(food.id)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </Button>
                        </div>
                        <h3>{food.name}</h3>
                        <p className="muted">
                          {food.brand || "ブランド未設定"}
                        </p>
                        <strong className="food-energy">
                          {f(food.kcal_100g)} <small>kcal / 100g</small>
                        </strong>
                        <p className="mini-macros">
                          P {f(food.protein_100g)}　F {f(food.fat_100g)}　C{" "}
                          {f(food.carbs_100g)} g
                        </p>
                        <details>
                          <summary>出典・ポーション</summary>
                          <p className="break-text">
                            {food.source_ref || "出典の記載なし"}{" "}
                            {food.source_version}
                          </p>
                          <p>{food.energy_basis}</p>
                          {food.portions.map((p) => (
                            <p key={p.id}>
                              {p.label} = {f(p.grams)} g
                            </p>
                          ))}
                        </details>
                        <div className="food-buttons">
                          <Button
                            onClick={() => setEditor({ type: "meal", food })}
                          >
                            <Plus size={16} />
                            記録
                          </Button>
                          {food.owner_id === data.user_id && (
                            <>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  setEditor({ type: "food", food })
                                }
                              >
                                編集
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`${food.name}を削除`}
                                disabled={pending}
                                onClick={() => {
                                  if (
                                    confirm(
                                      "食品を削除しますか？過去の記録は残り、テンプレートからは削除されます。",
                                    )
                                  )
                                    mutate("delete_food", { id: food.id });
                                }}
                              >
                                <Trash2 size={17} />
                              </Button>
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  {foods.length === 0 && (
                    <div className="card empty">
                      <BookOpen size={32} />
                      <h3>食品が見つかりません</h3>
                      <p>
                        栄養成分表示を見ながら、最初の食品を登録しましょう。
                      </p>
                      <Button onClick={() => setEditor({ type: "food" })}>
                        食品を登録
                      </Button>
                    </div>
                  )}
                </>
              )}
              {section === "settings" && (
                <div className="settings-grid">
                  <section className="card">
                    <h2>栄養目標</h2>
                    <p className="muted">
                      開始日以降に適用されます。カロリーはPFCと独立して設定できます。
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        mutate("target", Object.fromEntries(fd));
                      }}
                    >
                      <label>
                        適用開始日
                        <input
                          name="effective_from"
                          type="date"
                          defaultValue={date}
                          required
                        />
                      </label>
                      <NutrientFields values={goals} />
                      <Button disabled={pending} type="submit">
                        {pending ? "保存中…" : "目標を保存"}
                      </Button>
                    </form>
                    <h3 className="mt">目標の履歴</h3>
                    {data.targets.map((t) => (
                      <div className="target-row" key={t.id}>
                        <strong>
                          {t.effective_from === "0001-01-01"
                            ? "初期目標"
                            : t.effective_from + " から"}
                        </strong>
                        <small>
                          P {f(t.protein_g)} / F {f(t.fat_g)} / C {f(t.carbs_g)}{" "}
                          g · {f(t.calories_kcal)} kcal
                        </small>
                      </div>
                    ))}
                  </section>
                  <section className="card">
                    <h2>保存とバックアップ</h2>
                    <p>記録のタイムゾーン：Asia/Tokyo</p>
                    <p className="muted">
                      日時は日本時間で入力・集計します。ログインは不要です。データはこの端末の、このブラウザに保存されます。iPhoneとMacの自動同期はありません。ブラウザデータを削除すると記録も消えます。
                    </p>
                    <PwaPanel />
                    <BackupControls onRestore={load} data={data} />
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            PFC Tracker <span>毎日を、少しずつ健やかに。</span>
          </footer>
        </div>
      </main>
      <nav className="bottom-nav">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={section === n.key ? "page" : undefined}
            className={section === n.key ? "active" : ""}
          >
            <n.icon size={21} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
      {editor && data && (
        <EditorDialog
          editor={editor}
          data={data}
          date={date}
          pending={pending}
          error={error}
          onClose={() => {
            if (!pending) setEditor(null);
          }}
          onSave={mutate}
        />
      )}
    </div>
  );
}
function Meter({
  value,
  target,
  name,
}: {
  value: string | number;
  target: string | number;
  name: string;
}) {
  const p = progress(value, target);
  return (
    <div className="meter-wrap">
      <div
        className="meter"
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={Math.max(Number(target), Number(value), 1)}
        aria-valuenow={Number(value)}
        aria-valuetext={`${f(value)} / ${f(target)}、達成率 ${p.percent === null ? "目標未設定" : f(p.percent) + "%"}`}
      >
        <span
          style={{
            width: `${p.percent === null ? 0 : Math.min(p.percent, 100)}%`,
          }}
        />
      </div>
      <span className="meter-percent">
        {p.percent === null ? "目標なし" : f(p.percent) + "%"}
      </span>
    </div>
  );
}
function NutrientFields({
  values = { protein: "", fat: "", carbs: "", kcal: "" },
}: {
  values?: Nutrients;
}) {
  return (
    <div className="nutrient-inputs">
      {keys.map((k) => (
        <label key={k}>
          {labels[k]} ({k === "kcal" ? "kcal" : "g"})
          <input
            name={k}
            type="number"
            min="0"
            max="100000"
            step="any"
            required
            defaultValue={values[k]}
          />
        </label>
      ))}
    </div>
  );
}
function EditorDialog({
  editor,
  data,
  date,
  pending,
  error,
  onClose,
  onSave,
}: {
  editor: Editor;
  data: TrackerData;
  date: string;
  pending: boolean;
  error: string;
  onClose: () => void;
  onSave: (action: string, payload: unknown) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const existing = editor.type === "meal" ? editor.meal : undefined;
  const [foodId, setFoodId] = useState(
    editor.type === "meal" ? editor.food?.id || existing?.food_id || "" : "",
  );
  const [amount, setAmount] = useState(String(existing?.amount_g || 100));
  const [unit, setUnit] = useState("g");
  const [items, setItems] = useState<{ food_id: string; amount_g: number }[]>(
    [],
  );
  const [localError, setLocalError] = useState("");
  const [portionRows, setPortionRows] = useState<
    { label: string; grams: string }[]
  >(
    editor.type === "food"
      ? editor.food?.portions.map((p) => ({
          label: p.label,
          grams: String(p.grams),
        })) || []
      : [],
  );
  const food = data.foods.find((x) => x.id === foodId);
  const portion = food?.portions.find((p) => p.id === unit);
  let grams = Number(amount);
  if (unit !== "g") {
    try {
      grams = Number(portionGrams(amount, portion?.grams || 0));
    } catch {
      grams = NaN;
    }
  }
  let preview: Nutrients | null = null;
  try {
    if (
      existing &&
      foodId === existing.food_id &&
      grams === Number(existing.amount_g)
    )
      preview = mealN(existing);
    else if (food) preview = calculate(foodN(food), grams);
  } catch {
    /* Invalid values are rejected by the form/server. */
  }
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const mealTime = existing
    ? new Date(new Date(existing.consumed_at).getTime() + 9 * 3600000)
        .toISOString()
        .slice(0, 16)
    : `${date}T12:00`;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError("");
    const fd = new FormData(e.currentTarget),
      obj = Object.fromEntries(fd);
    try {
      if (editor.type === "food")
        onSave("food", {
          ...obj,
          id: editor.food?.id,
          portions: portionRows.map((p) => ({
            label: p.label,
            grams: Number(p.grams),
          })),
        });
      if (editor.type === "meal") {
        if (!Number.isFinite(grams) || grams <= 0 || grams > 100000)
          throw new Error("重量は0より大きく100,000g以下にしてください。");
        onSave("meal", {
          id: existing?.id,
          food_id: foodId || null,
          amount_g: grams,
          meal_type: obj.meal_type,
          consumed_at: new Date(`${obj.consumed_at}:00+09:00`).toISOString(),
        });
      }
      if (editor.type === "template") {
        if (items.length === 0)
          throw new Error("食品を1件以上追加してください。");
        onSave("template", { name: obj.name, items });
      }
      if (editor.type === "apply")
        onSave("apply_template", {
          id: editor.template.id,
          meal_type: obj.meal_type,
          consumed_at: new Date(`${obj.consumed_at}:00+09:00`).toISOString(),
        });
    } catch (e) {
      setLocalError(
        e instanceof Error ? e.message : "入力を確認してください。",
      );
    }
  }
  return (
    <dialog
      ref={dialog}
      className="editor-dialog"
      aria-labelledby="editor-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id="editor-title">
          {editor.type === "food"
            ? editor.food
              ? "食品を編集"
              : "食品を登録"
            : editor.type === "meal"
              ? existing
                ? "食事記録を編集"
                : "食品を記録"
              : editor.type === "template"
                ? "テンプレートを作成"
                : "テンプレートを記録"}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="閉じる"
          disabled={pending}
          onClick={onClose}
        >
          <X size={21} />
        </Button>
      </div>
      <form ref={formRef} onSubmit={submit}>
        <fieldset disabled={pending}>
          {(error || localError) && (
            <p className="message error" role="alert">
              {localError || error}
            </p>
          )}
          {editor.type === "food" && (
            <>
              <label>
                食品名
                <input
                  name="name"
                  maxLength={150}
                  required
                  defaultValue={editor.food?.name}
                  placeholder="例：ご飯（炊飯後）"
                />
              </label>
              <small>
                生・加熱後、皮あり・なし、炊飯前・後は別食品として登録。
              </small>
              <label>
                ブランド / メーカー
                <input
                  name="brand"
                  maxLength={150}
                  defaultValue={editor.food?.brand}
                />
              </label>
              <h3>100gあたりの栄養成分</h3>
              <NutrientFields
                values={editor.food ? foodN(editor.food) : undefined}
              />
              <label>
                出典の種類
                <select
                  name="source_type"
                  defaultValue={editor.food?.source_type || "manual"}
                >
                  {Object.entries(sources).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                出典 URL / 食品コード / 商品表示の情報
                <input
                  name="source_ref"
                  maxLength={1000}
                  defaultValue={editor.food?.source_ref}
                />
              </label>
              <label>
                版・確認日
                <input
                  name="source_version"
                  maxLength={150}
                  defaultValue={editor.food?.source_version}
                  placeholder="例：2026-10-26 商品ラベル確認"
                />
              </label>
              <label>
                エネルギー値の根拠
                <input
                  name="energy_basis"
                  maxLength={150}
                  required
                  defaultValue={
                    editor.food?.energy_basis || "栄養成分表示の公表値"
                  }
                />
              </label>
              <h3>ポーション換算（任意）</h3>
              <p className="muted">この食品に固有の重量を登録します。</p>
              {portionRows.map((p, i) => (
                <div className="portion-row" key={i}>
                  <label>
                    単位名
                    <input
                      required
                      value={p.label}
                      maxLength={50}
                      placeholder="1パック"
                      onChange={(e) =>
                        setPortionRows((rows) =>
                          rows.map((r, j) =>
                            i === j ? { ...r, label: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    重量 (g)
                    <input
                      type="number"
                      required
                      min="0.001"
                      max="100000"
                      step="any"
                      value={p.grams}
                      onChange={(e) =>
                        setPortionRows((rows) =>
                          rows.map((r, j) =>
                            i === j ? { ...r, grams: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`ポーション${i + 1}を削除`}
                    onClick={() =>
                      setPortionRows((rows) => rows.filter((_, j) => j !== i))
                    }
                  >
                    <X size={16} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={portionRows.length >= 20}
                onClick={() =>
                  setPortionRows((rows) => [...rows, { label: "", grams: "" }])
                }
              >
                ポーションを追加
              </Button>
            </>
          )}
          {editor.type === "meal" && (
            <>
              <label>
                食品
                <select
                  required={!existing || !!existing.food_id}
                  value={foodId}
                  onChange={(e) => {
                    setFoodId(e.target.value);
                    setUnit("g");
                  }}
                >
                  <option value="">
                    {existing && !existing.food_id
                      ? "削除済み食品（日時のみ編集可能）"
                      : "食品を選択"}
                  </option>
                  {data.foods.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} {f.brand}
                    </option>
                  ))}
                </select>
              </label>
              {data.foods.length === 0 && !existing && (
                <p>先に「食品」画面で食品を登録してください。</p>
              )}
              <div className="two-cols">
                <label>
                  分量
                  <input
                    type="number"
                    min="0.001"
                    max="100000"
                    step="any"
                    required
                    value={amount}
                    disabled={!!existing && !existing.food_id && !foodId}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label>
                  単位
                  <select
                    aria-label="単位"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  >
                    <option value="g">g</option>
                    {food?.portions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} ({f(p.grams)}g)
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!food?.portions.length && (
                <small>
                  ポーション未登録のため、グラムで入力してください。
                </small>
              )}
              {preview && (
                <div className="nutrition-preview">
                  <strong>
                    {f(grams)} g · {f(preview.kcal)} kcal
                  </strong>
                  <span>
                    P {f(preview.protein)} / F {f(preview.fat)} / C{" "}
                    {f(preview.carbs)} g
                  </span>
                  <small>
                    {food && sources[food.source_type]}
                    {existing
                      ? " · 食品・重量変更時のみ現在のマスター値で再計算"
                      : ""}
                  </small>
                </div>
              )}
              {existing && (
                <small>
                  日時・食事区分のみの変更では元の栄養スナップショットを保持します。
                </small>
              )}
            </>
          )}
          {(editor.type === "meal" || editor.type === "apply") && (
            <>
              <label>
                記録日時（日本時間）
                <input
                  name="consumed_at"
                  type="datetime-local"
                  required
                  defaultValue={mealTime}
                />
              </label>
              <label>
                食事区分
                <select
                  name="meal_type"
                  defaultValue={
                    existing?.meal_type ||
                    (editor.type === "meal" ? editor.mealType : undefined) ||
                    "lunch"
                  }
                >
                  {Object.entries(mealTypes).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {editor.type === "template" && (
            <>
              <label>
                テンプレート名
                <input
                  name="name"
                  required
                  maxLength={100}
                  placeholder="例：いつもの朝ごはん"
                />
              </label>
              <label>
                追加する食品
                <select
                  value={foodId}
                  onChange={(e) => setFoodId(e.target.value)}
                >
                  <option value="">食品を選択</option>
                  {data.foods.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                重量 (g)
                <input
                  type="number"
                  min="0.001"
                  max="100000"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={
                  !foodId ||
                  !Number.isFinite(Number(amount)) ||
                  Number(amount) <= 0 ||
                  Number(amount) > 100000 ||
                  items.length >= 50
                }
                onClick={() =>
                  setItems((rows) => [
                    ...rows,
                    { food_id: foodId, amount_g: Number(amount) },
                  ])
                }
              >
                組み合わせに追加
              </Button>
              {items.map((item, i) => (
                <div className="template-row" key={i}>
                  <span>
                    {data.foods.find((f) => f.id === item.food_id)?.name} ·{" "}
                    {f(item.amount_g)}g
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`食品${i + 1}を除く`}
                    onClick={() =>
                      setItems((rows) => rows.filter((_, j) => j !== i))
                    }
                  >
                    <X size={16} />
                  </Button>
                </div>
              ))}
            </>
          )}
          {editor.type === "apply" && (
            <div className="nutrition-preview">
              <strong>{editor.template.name}</strong>
              {editor.template.items.map((item, i) => (
                <span key={i}>
                  {data.foods.find((f) => f.id === item.food_id)?.name ||
                    "参照不可の食品"}{" "}
                  · {f(item.amount_g)}g
                </span>
              ))}
              <small>
                現在の食品マスターから計算し、すべてを一括で記録します。
              </small>
            </div>
          )}
        </fieldset>
        <div className="dialog-footer">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            キャンセル
          </Button>
          <Button
            type="submit"
            disabled={
              pending || (editor.type === "meal" && !foodId && !existing)
            }
          >
            {pending
              ? "保存中…"
              : editor.type === "apply"
                ? "まとめて記録"
                : "保存する"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
