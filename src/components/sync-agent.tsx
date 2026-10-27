"use client";
import { useEffect, useState } from "react";
import { syncOnce } from "@/lib/cloud-sync";
import { readSyncState } from "@/lib/local-store";
export function SyncAgent() {
  const [status, setStatus] = useState(""),
    [failure, setFailure] = useState(false);
  useEffect(() => {
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    async function run() {
      if (document.visibilityState === "hidden") return;
      try {
        const { config } = await readSyncState();
        if (!live) return;
        if (!config) {
          setStatus("");
          return;
        }
        if (!navigator.onLine) {
          setStatus("オフライン · 再接続時に自動同期");
          setFailure(false);
          return;
        }
        setStatus("同期中…");
        const changed = await syncOnce();
        if (!live) return;
        setFailure(false);
        setStatus("端末間の自動同期が有効です");
        if (changed) window.dispatchEvent(new Event("pfc-sync-data"));
      } catch (e) {
        if (live) {
          setFailure(true);
          setStatus(
            e instanceof Error
              ? e.message
              : "同期できませんでした。記録は端末に保持しています。",
          );
        }
      }
    }
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), 400);
    };
    const interval = setInterval(() => void run(), 15000);
    timer = setTimeout(() => void run(), 0);
    window.addEventListener("online", schedule);
    window.addEventListener("offline", schedule);
    window.addEventListener("pfc-local-change", schedule);
    window.addEventListener("pfc-sync-request", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      live = false;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("online", schedule);
      window.removeEventListener("offline", schedule);
      window.removeEventListener("pfc-local-change", schedule);
      window.removeEventListener("pfc-sync-request", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, []);
  return status ? (
    <p
      className={`sync-status ${failure ? "sync-error" : ""}`}
      aria-live="polite"
    >
      {status}
    </p>
  ) : null;
}
