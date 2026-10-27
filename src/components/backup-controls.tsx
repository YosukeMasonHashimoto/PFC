"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { decodeBackup, encodeBackup } from "@/lib/local-data";
import { loadLocal, replaceLocal } from "@/lib/local-store";
import type { TrackerData } from "@/lib/types";
import { localDate } from "@/lib/nutrition";
export function BackupControls({
  onRestore,
  data,
}: {
  onRestore: () => Promise<void>;
  data?: TrackerData;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const lock = useRef(false);
  const [shareSupported, setShareSupported] = useState(false);
  useEffect(() => {
    const timer = setTimeout(
      () => setShareSupported(typeof navigator.share === "function"),
      0,
    );
    return () => clearTimeout(timer);
  }, []);
  const filename = () =>
    `pfc-tracker-${localDate(new Date().toISOString())}.json`;
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setMessage("共有をキャンセルしました。");
        return;
      }
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
        記録はまずこのブラウザに保存されます。自動同期を有効にしていても、ブラウザデータを削除する前や端末を移すときはバックアップしてください。ファイルには食品・食事・目標が含まれます。
      </p>
      <div className="backup-actions">
        {shareSupported && data && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                // Build synchronously from rendered, persisted state: iOS must retain the tap's user activation.
                const file = new File([encodeBackup(data)], filename(), {
                  type: "application/json",
                });
                if (!navigator.canShare?.({ files: [file] }))
                  throw new Error(
                    "この環境ではファイルを共有できません。「バックアップを書き出す」をお使いください。",
                  );
                await navigator.share({
                  files: [file],
                  title: "PFC Tracker バックアップ",
                });
                setMessage(
                  "共有操作が完了しました。「ファイルに保存」を選んだ場合は保存先をご確認ください。",
                );
              })
            }
          >
            ファイルに保存・共有
          </Button>
        )}
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
              a.download = filename();
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 30000);
              setMessage(
                "バックアップファイルを作成しました。ダウンロード先を確認してください。",
              );
            })
          }
        >
          バックアップを書き出す
        </Button>
      </div>
      {shareSupported && (
        <p className="muted">
          iPhoneでは「ファイルに保存・共有」から「ファイルに保存」を選べます。
        </p>
      )}
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
