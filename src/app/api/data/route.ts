import { NextRequest, NextResponse } from "next/server";
import { supabase, configured } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/config";
import { mutationSchema } from "@/lib/validation";
export async function GET() {
  if (!configured())
    return NextResponse.json(
      { error: "Supabase が未設定です" },
      { status: 503 },
    );
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "ログインしてください" },
      { status: 401 },
    );
  const { data, error } = await db.rpc("tracker_data");
  return NextResponse.json(
    error
      ? {
          error:
            "データを取得できません。接続とマイグレーションを確認してください。",
        }
      : data,
    {
      status: error ? 500 : 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== appOrigin())
    return NextResponse.json(
      { error: "許可されていない送信元です" },
      { status: 403 },
    );
  if (!configured())
    return NextResponse.json(
      { error: "Supabase が未設定です" },
      { status: 503 },
    );
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "入力形式が不正です" }, { status: 400 });
  }
  const parsed = mutationSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      {
        error:
          "入力値を確認してください。重量は正数、栄養値は0以上で指定してください。",
      },
      { status: 400 },
    );
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "再ログインしてください" },
      { status: 401 },
    );
  const { error } = await db.rpc("tracker_mutate", {
    operation: parsed.data.action,
    payload: parsed.data.data,
  });
  if (error) {
    console.error("tracker mutation", error.code);
    return NextResponse.json(
      {
        error:
          "保存できませんでした。食品の参照権限・入力値・接続を確認してください。",
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
