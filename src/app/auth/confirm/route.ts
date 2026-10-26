import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { appOrigin } from "@/lib/config";
import { supabase } from "@/lib/supabase/server";
export async function GET(req: NextRequest) {
  const token_hash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type");
  if (token_hash && type === "email") {
    const db = await supabase();
    const { error } = await db.auth.verifyOtp({
      token_hash,
      type: type as EmailOtpType,
    });
    if (!error) return NextResponse.redirect(new URL("/", appOrigin()));
  }
  return NextResponse.redirect(new URL("/login?error=expired", appOrigin()));
}
