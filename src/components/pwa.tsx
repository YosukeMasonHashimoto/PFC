"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
type State = {
  online: boolean | null;
  standalone: boolean;
  ready: boolean;
  update: boolean;
  error: string;
  activate: () => void;
};
const Context = createContext<State>({
  online: null,
  standalone: false,
  ready: false,
  update: false,
  error: "",
  activate: () => {},
});
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState<boolean | null>(null),
    [standalone, setStandalone] = useState(false),
    [ready, setReady] = useState(false),
    [update, setUpdate] = useState(false),
    [error, setError] = useState("");
  const registration = useRef<ServiceWorkerRegistration | null>(null),
    restarting = useRef(false);
  useEffect(() => {
    let disposed = false;
    let readinessTimer: ReturnType<typeof setTimeout> | undefined;
    const media = window.matchMedia("(display-mode: standalone)");
    const sync = () => {
      setOnline(navigator.onLine);
      setStandalone(
        media.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    };
    const timer = setTimeout(sync, 0);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    media.addEventListener("change", sync);
    async function status() {
      const worker = registration.current?.active;
      if (!worker) return;
      const result = await new Promise<boolean>((resolve) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => {
          channel.port1.close();
          resolve(false);
        }, 2500);
        channel.port1.onmessage = (event) => {
          clearTimeout(timeout);
          channel.port1.close();
          resolve(event.data?.ready === true);
        };
        worker.postMessage({ type: "PFC_STATUS" }, [channel.port2]);
      });
      if (!disposed) setReady(result);
    }
    const controlled = () => {
      if (restarting.current) {
        window.location.reload();
        return;
      }
      void status();
    };
    async function register() {
      if (
        !("serviceWorker" in navigator) ||
        process.env.NODE_ENV !== "production"
      )
        return;
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none",
        });
        if (disposed) return;
        registration.current = reg;
        if (reg.waiting) setUpdate(true);
        const observe = (worker: ServiceWorker | null) => {
          if (!worker) return;
          const changed = () => {
            if (disposed) return;
            if (worker.state === "redundant") {
              setError(
                "オフラインの準備に失敗しました。接続・空き容量を確認し、再読み込みしてください。",
              );
              return;
            }
            if (worker.state !== "installed") return;
            if (reg.waiting && navigator.serviceWorker.controller)
              setUpdate(true);
            else void navigator.serviceWorker.ready.then(() => status());
          };
          worker.addEventListener("statechange", changed);
          changed();
        };
        observe(reg.installing);
        reg.addEventListener("updatefound", () => observe(reg.installing));
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => {
            readinessTimer = setTimeout(
              () => reject(new Error("precache timeout")),
              30000,
            );
          }),
        ]);
        clearTimeout(readinessTimer);
        if (!disposed) await status();
      } catch {
        if (!disposed)
          setError(
            "オフラインの準備ができませんでした。接続を確認して再読み込みしてください。",
          );
      }
    }
    navigator.serviceWorker?.addEventListener("controllerchange", controlled);
    void register();
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(readinessTimer);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      media.removeEventListener("change", sync);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        controlled,
      );
    };
  }, []);
  function activate() {
    const worker = registration.current?.waiting;
    if (!worker) return;
    restarting.current = true;
    worker.postMessage({ type: "PFC_ACTIVATE" });
  }
  return (
    <Context.Provider
      value={{ online, standalone, ready, update, error, activate }}
    >
      {children}
    </Context.Provider>
  );
}
/** Native document navigation offline uses the installed shell, without relying on an RSC fetch. */
export function AppLink(
  props: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string },
) {
  return (
    <Link
      {...props}
      prefetch={false}
      onNavigate={(event) => {
        if (!navigator.onLine) {
          event.preventDefault();
          window.location.assign(String(props.href));
        }
      }}
    />
  );
}
export function PwaStatus() {
  const state = useContext(Context);
  return (
    <>
      {state.online === false && (
        <div className="message offline-status" role="status">
          オフライン · 記録はこの端末に保存されます
        </div>
      )}
      {state.update && (
        <div className="message pwa-update">
          アプリの更新があります。
          <AppLink href="/settings">設定から更新する</AppLink>
        </div>
      )}
    </>
  );
}
export function PwaPanel() {
  const state = useContext(Context);
  return (
    <section className="pwa-panel">
      <h3>iPhoneでアプリとして使う</h3>
      {state.standalone ? (
        <p className="installed-label">ホーム画面版で利用中</p>
      ) : (
        <ol>
          <li>Safariでこのページを開く</li>
          <li>共有ボタンから「ホーム画面に追加」を選ぶ</li>
          <li>「Webアプリとして開く」が表示された場合はオンにして追加</li>
          <li>ホーム画面の「PFC Tracker」アイコンから起動</li>
        </ol>
      )}
      <p className="muted">
        Safariとホーム画面版で保存領域が分かれる場合があります。すでに記録がある場合は先にバックアップを書き出し、ホーム画面版で読み込んでください。
      </p>
      <p className="pwa-readiness" aria-live="polite">
        {state.ready
          ? "オフライン準備完了"
          : state.online === false
            ? "オフライン起動の準備には接続が必要です"
            : "オフラインで使う準備中…（公開版のみ）"}
      </p>
      <p className="muted">
        初回は準備完了まで接続したままお待ちください。その後は通信がなくても起動・記録できます。iOSによる保存データの削除に備えて定期的にバックアップしてください。
      </p>
      {state.error && <p role="alert">{state.error}</p>}
      {state.update && (
        <Button
          variant="outline"
          onClick={() => {
            if (
              confirm(
                "保存済みの記録を保持してアプリを再起動します。更新しますか？",
              )
            )
              state.activate();
          }}
        >
          更新して再起動
        </Button>
      )}
    </section>
  );
}
