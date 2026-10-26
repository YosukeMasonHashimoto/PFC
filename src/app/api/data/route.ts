import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json(
    {
      error: "クラウド保存APIは停止しました。記録はブラウザ内に保存されます。",
    },
    { status: 410 },
  );
}
export const POST = GET;
