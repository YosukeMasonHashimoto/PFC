"use client";
import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { decodeBackup, encodeBackup } from "@/lib/local-data";
import { loadLocal, replaceLocal } from "@/lib/local-store";
export function BackupControls({
  onRestore,
}: {
  onRestore: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "バックアップを処理できませんでした。",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>バックアップと端末間の移動</h3>
      <p className="muted">
        記録はこのブラウザだけに保存されます。ブラウザデータを削除する前や、別端末へ移すときにバックアップしてください。ファイルには食品・食事・目標が含まれます。
      </p>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const text = encodeBackup(await loadLocal());
            const url = URL.createObjectURL(
              new Blob([text], { type: "application/json" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = `pfc-tracker-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            setMessage(
              "バックアップファイルを作成しました。ダウンロード先を確認してください。",
            );
          })
        }
      >
        バックアップを書き出す
      </Button>
      <label className="mt">
        バックアップを読み込む（現在の記録を置き換え）
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (!file) return;
            run(async () => {
              if (file.size > 20 * 1024 * 1024)
                throw new Error("ファイルは20MB以下にしてください。");
              const data = decodeBackup(await file.text());
              if (
                !confirm(
                  `食品${data.foods.length}件・食事${data.meals.length}件を復元し、このブラウザの現在の記録を置き換えます。続けますか？`,
                )
              )
                return;
              await replaceLocal(data);
              await onRestore();
              setMessage("バックアップを復元しました。");
            });
          }}
        />
      </label>
      {busy && <p role="status">処理中…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
