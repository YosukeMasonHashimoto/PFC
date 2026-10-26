import { applyMutation, initialData, validateData } from "./local-data";
import type { TrackerData } from "./types";
const DB = "pfc-tracker-local-v1";
const STORE = "tracker";
const KEY = "data";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(
        new Error(
          "このブラウザでは端末内保存を利用できません。通常モードのブラウザをお使いください。",
        ),
      );
      return;
    }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "端末内データを開けません。ブラウザの保存設定を確認してください。",
        ),
      );
    request.onblocked = () =>
      reject(new Error("別のタブを閉じて再読み込みしてください。"));
  });
}
/** Serialized IDB read/write transaction prevents lost updates across browser tabs. */
async function transact(
  change?: (data: TrackerData) => TrackerData,
  replace = false,
): Promise<TrackerData> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"),
      store = tx.objectStore(STORE);
    let result: TrackerData;
    let failure: unknown;
    const request = store.get(KEY);
    request.onsuccess = () => {
      try {
        const old =
          replace || request.result === undefined
            ? initialData()
            : validateData(request.result);
        result = change ? change(old) : old;
        if (change || request.result === undefined) store.put(result, KEY);
      } catch (e) {
        failure =
          e instanceof DOMException
            ? new Error(
                "端末に保存できませんでした。空き容量・ブラウザの保存設定を確認してください。",
              )
            : e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        failure ||
          new Error(
            "端末に保存できませんでした。空き容量・ブラウザの保存設定を確認してください。",
          ),
      );
    };
  });
}
export const loadLocal = () => transact();
export const mutateLocal = (action: string, payload: unknown) =>
  transact((data) => applyMutation(data, action, payload));
export const replaceLocal = (data: TrackerData) =>
  transact(() => validateData(data), true);
