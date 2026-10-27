import { validateData } from "./local-data";
import type { TrackerData } from "./types";
const encode = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const decode = (value: string) =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
export function newSyncCode() {
  return `pfc1.${crypto.randomUUID()}.${encode(crypto.getRandomValues(new Uint8Array(32)))}`;
}
export function parseSyncCode(input: string) {
  const value = input.trim();
  const match =
    /^pfc1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(
      value,
    );
  if (!match) throw new Error("同期コードを確認してください。");
  const bytes = decode(match[2]);
  if (bytes.length !== 32 || encode(bytes) !== match[2])
    throw new Error("同期コードが不正です。");
  return { workspace: match[1], bytes, code: value };
}
export async function syncProof(code: string) {
  const { bytes } = parseSyncCode(code);
  const input = new TextEncoder().encode(`pfc-sync-auth:${encode(bytes)}`);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", input)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
async function key(code: string) {
  return crypto.subtle.importKey(
    "raw",
    parseSyncCode(code).bytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptSync(code: string, data: TrackerData) {
  const content = new TextEncoder().encode(JSON.stringify(validateData(data)));
  if (content.byteLength > 8 * 1024 * 1024)
    throw new Error(
      "同期できるデータ量（8MB）を超えています。端末内の記録は保持しています。",
    );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(parseSyncCode(code).workspace),
    },
    await key(code),
    content,
  );
  return `${encode(iv)}.${encode(new Uint8Array(cipher))}`;
}
export async function decryptSync(
  code: string,
  blob: string,
): Promise<TrackerData> {
  try {
    if (blob.length > 16 * 1024 * 1024) throw new Error();
    const [iv, cipher, ...extra] = blob.split(".");
    if (extra.length || !iv || !cipher) throw new Error();
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decode(iv),
        additionalData: new TextEncoder().encode(parseSyncCode(code).workspace),
      },
      await key(code),
      decode(cipher),
    );
    return validateData(JSON.parse(new TextDecoder().decode(plain)));
  } catch {
    throw new Error(
      "同期データを復号できません。同期コードを確認してください。端末の記録は変更していません。",
    );
  }
}
