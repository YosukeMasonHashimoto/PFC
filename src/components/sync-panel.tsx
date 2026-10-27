"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  createSync,
  joinSync,
  syncOnce,
  syncAvailable,
} from "@/lib/cloud-sync";
import { readSyncState, disconnectSync } from "@/lib/local-store";
import { encodeBackup } from "@/lib/local-data";
import type { SyncConfig } from "@/lib/sync-model";
export function SyncPanel() {
  const [config, setConfig] = useState<SyncConfig | null>(null),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    void readSyncState()
      .then((s) => {
        if (live) setConfig(s.config);
      })
      .catch(() => {
        if (live)
          setError(
            "同期設定を読み込めません。端末の保存設定を確認してください。",
          );
      });
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const incoming = hash.get("sync");
    if (incoming) {
      setTimeout(() => setInput(incoming), 0);
      history.replaceState(
        history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
    return () => {
      live = false;
    };
  }, []);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await syncOnce();
      setConfig((await readSyncState()).config);
      window.dispatchEvent(new Event("pfc-sync-request"));
      window.dispatchEvent(new Event("pfc-sync-data"));
      setNotice("端末の連携・同期を確認しました。");
    } catch (e) {
      try {
        setConfig((await readSyncState()).config);
      } catch {
        /* The original error is shown below. */
      }
      setError(e instanceof Error ? e.message : "同期できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="pwa-panel">
      <h3>スマホ・PCの自動同期</h3>
      <p className="muted">
        最初に一度だけ、自分の端末同士を連携します。メールログインは不要です。連携後は画面を開いている間と、接続が戻ったときに自動で同期します。
      </p>
      {!syncAvailable() ? (
        <p>
          同期用サービスが未設定です。端末内保存とバックアップは利用できます。
        </p>
      ) : config ? (
        <>
          <p>この端末は連携済みです。</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run(() => syncOnce())}
          >
            今すぐ同期
          </Button>
          <details>
            <summary>別の端末を連携する</summary>
            <p className="muted">
              このリンクを自分のもう一方の端末で開き、「この端末を連携」を押してください。リンク・コードは記録へのアクセス鍵です。第三者に渡したり公開したりしないでください。
            </p>
            <input
              aria-label="同期コード"
              readOnly
              value={config.code}
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${location.origin}/settings#sync=${encodeURIComponent(config.code)}`,
                  );
                  setNotice(
                    "連携リンクをコピーしました。自分のもう一方の端末で開いてください。",
                  );
                } catch {
                  setError(
                    "コピーできませんでした。同期コードを選択してコピーしてください。",
                  );
                }
              }}
            >
              連携リンクをコピー
            </Button>
          </details>
          {config.recovery && (
            <Button
              variant="ghost"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([encodeBackup(config.recovery!)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "pfc-before-pairing.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 30000);
              }}
            >
              連携前の記録を書き出す
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (
                !confirm(
                  "この端末の自動同期を停止します。記録は端末に残ります。他の端末の連携は変わりません。",
                )
              )
                return;
              await disconnectSync();
              setConfig(null);
              window.dispatchEvent(new Event("pfc-sync-request"));
            }}
          >
            この端末の同期を停止
          </Button>
        </>
      ) : (
        <>
          <Button disabled={busy} onClick={() => run(() => createSync())}>
            この端末から同期を開始
          </Button>
          <label className="mt">
            もう一方の端末の同期コード
            <input
              aria-label="連携する同期コード"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <p className="muted">
            この端末にしかない記録は追加します。両方に同じ記録がある場合は同期先を優先します。連携前の記録も端末内に退避します。
          </p>
          <Button
            variant="outline"
            disabled={busy || !input.trim()}
            onClick={() => run(() => joinSync(input))}
          >
            この端末を連携
          </Button>
        </>
      )}
      {busy && <p>接続・同期しています…</p>}
      {notice && <p aria-live="polite">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
