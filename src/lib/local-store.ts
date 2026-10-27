import { applyMutation, initialData, validateData } from "./local-data";
import { mergeData, type SyncConfig } from "./sync-model";
import type { TrackerData } from "./types";
const DB = "pfc-tracker-local-v1",
  STORE = "tracker",
  KEY = "data",
  SYNC = "sync";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(
        new Error(
          "このブラウザでは端末内保存を利用できません。通常モードをお使いください。",
        ),
      );
      return;
    }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error("端末内データを開けません。保存設定を確認してください。"),
      );
    request.onblocked = () =>
      reject(new Error("別のタブを閉じて再読み込みしてください。"));
  });
}
type State = { data: TrackerData; config: SyncConfig | null };
async function transaction<T>(
  change: (state: State) => {
    result: T;
    data?: TrackerData;
    config?: SyncConfig | null;
  },
  replace = false,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"),
      store = tx.objectStore(STORE),
      a = store.get(KEY),
      b = store.get(SYNC);
    let count = 0,
      result: T,
      failure: unknown;
    const apply = () => {
      if (++count < 2) return;
      try {
        const data =
            replace || a.result === undefined
              ? initialData()
              : validateData(a.result),
          config = (b.result || null) as SyncConfig | null;
        const next = change({ data, config });
        result = next.result;
        if (next.data !== undefined || a.result === undefined)
          store.put(next.data ?? data, KEY);
        if (next.config !== undefined) {
          if (next.config === null) store.delete(SYNC);
          else store.put(next.config, SYNC);
        }
      } catch (e) {
        failure =
          e instanceof DOMException
            ? new Error(
                "端末に保存できませんでした。空き容量・保存設定を確認してください。",
              )
            : e;
        tx.abort();
      }
    };
    a.onsuccess = apply;
    b.onsuccess = apply;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        failure ||
          new Error(
            "端末に保存できませんでした。空き容量・保存設定を確認してください。",
          ),
      );
    };
  });
}
function announce(localEdit: boolean) {
  if (typeof window === "undefined") return;
  if (localEdit) window.dispatchEvent(new Event("pfc-local-change"));
  if (typeof BroadcastChannel !== "undefined") {
    const c = new BroadcastChannel("pfc-local-updates");
    c.postMessage("saved");
    c.close();
  }
}
export const loadLocal = () => transaction(({ data }) => ({ result: data }));
export async function mutateLocal(action: string, payload: unknown) {
  const result = await transaction(({ data }) => {
    const next = applyMutation(data, action, payload);
    return { data: next, result: next };
  });
  announce(true);
  return result;
}
export async function replaceLocal(data: TrackerData) {
  const next = validateData(data);
  const result = await transaction(() => ({ data: next, result: next }), true);
  announce(true);
  return result;
}
export const readSyncState = () => transaction((state) => ({ result: state }));
export async function configureSync(
  config: SyncConfig,
  captured: TrackerData,
  nextData: TrackerData,
) {
  await transaction(({ data }) => ({
    data: mergeData(captured, data, nextData),
    config,
    result: undefined,
  }));
  announce(false);
}
export async function acknowledgeSync(
  code: string,
  captured: TrackerData,
  cloud: TrackerData,
  revision: number,
) {
  await transaction(({ data, config }) => {
    if (config?.code !== code || config.revision > revision)
      return { result: undefined };
    return {
      data: mergeData(captured, data, cloud),
      config: { ...config, base: cloud, revision },
      result: undefined,
    };
  });
  announce(false);
}
export async function disconnectSync() {
  await transaction(() => ({ config: null, result: undefined }));
  announce(false);
}
