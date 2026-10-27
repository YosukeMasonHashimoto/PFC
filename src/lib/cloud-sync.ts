import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  newSyncCode,
  parseSyncCode,
  syncProof,
  encryptSync,
  decryptSync,
} from "./sync-crypto";
import { mergeData, mergeInitial, sameData } from "./sync-model";
import { readSyncState, configureSync, acknowledgeSync } from "./local-store";
let client: SupabaseClient | undefined;
export function syncAvailable() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
async function session() {
  if (!syncAvailable())
    throw new Error(
      "クラウド同期の接続設定がありません。端末内の記録は利用できます。",
    );
  client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { storageKey: "pfc-device-session-v1", detectSessionInUrl: false },
    },
  );
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    const { error } = await client.auth.signInAnonymously();
    if (error)
      throw new Error(
        "端末の同期セッションを開始できませんでした。接続・同期サービス設定を確認してください。",
      );
  }
  return client;
}
type Document = { revision: number; blob: string };
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const db = await session();
  const { data, error } = await db.rpc(name, args);
  if (error)
    throw new Error(
      error.code === "42501"
        ? "同期コードまたは端末の連携を確認してください。記録は端末に保持しています。"
        : "同期サービスに接続できませんでした。接続時に再試行します。記録は端末に保持しています。",
    );
  return data as T;
}
export async function createSync() {
  const current = await readSyncState();
  if (current.config) return current.config.code;
  const code = newSyncCode(),
    { workspace } = parseSyncCode(code);
  const result = await rpc<Document>("sync_create", {
    workspace,
    proof: await syncProof(code),
    blob: await encryptSync(code, current.data),
  });
  const cloud = await decryptSync(code, result.blob);
  await configureSync(
    { code, base: cloud, revision: result.revision },
    current.data,
    cloud,
  );
  return code;
}
export async function joinSync(input: string) {
  const { workspace, code } = parseSyncCode(input),
    current = await readSyncState();
  const result = await rpc<Document>("sync_join", {
      workspace,
      proof: await syncProof(code),
    }),
    cloud = await decryptSync(code, result.blob);
  const combined = mergeInitial(current.data, cloud);
  await configureSync(
    { code, base: cloud, revision: result.revision, recovery: current.data },
    current.data,
    combined,
  );
  return code;
}
async function readRemote(
  code: string,
  knownRevision: number,
): Promise<{ revision: number; blob: string | null }> {
  const { workspace } = parseSyncCode(code),
    db = await session();
  const result = await db.rpc("sync_read", {
    workspace,
    known_revision: knownRevision,
  });
  if (result.error?.code === "42501")
    return rpc<Document>("sync_join", {
      workspace,
      proof: await syncProof(code),
    });
  if (result.error)
    throw new Error("同期データを取得できませんでした。接続時に再試行します。");
  return result.data as Document;
}
let inFlight: Promise<boolean> | null = null;
export function syncOnce(): Promise<boolean> {
  if (inFlight) return inFlight;
  const perform = async () => {
    let changed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await readSyncState();
      if (!current.config) return changed;
      const { code, base } = current.config,
        { workspace } = parseSyncCode(code);
      const remote = await readRemote(code, current.config.revision),
        cloud =
          remote.blob === null ? base : await decryptSync(code, remote.blob);
      const merged = mergeData(base, current.data, cloud);
      if (sameData(merged, cloud)) {
        await acknowledgeSync(code, current.data, cloud, remote.revision);
        return !sameData(current.data, cloud) || changed;
      }
      const result = await rpc<{ revision: number | null; conflict: boolean }>(
        "sync_write",
        {
          workspace,
          expected_revision: remote.revision,
          blob: await encryptSync(code, merged),
        },
      );
      if (result.conflict) continue;
      await acknowledgeSync(code, current.data, merged, result.revision!);
      changed = true;
      const latest = await readSyncState();
      if (!latest.config || sameData(latest.data, latest.config.base))
        return changed;
    }
    throw new Error(
      "別の端末の更新と調整中です。変更は端末に保持し、次の同期で再試行します。",
    );
  };
  inFlight = (
    navigator.locks
      ? navigator.locks.request(
          "pfc-cloud-sync",
          { ifAvailable: true },
          (lock) => (lock ? perform() : false),
        )
      : perform()
  ).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
