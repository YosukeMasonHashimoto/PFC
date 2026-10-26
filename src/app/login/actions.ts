"use server";
import { sendErrorReason } from "@/lib/auth-errors";
import { redirect } from "next/navigation";
import { appOrigin } from "@/lib/config";
import { z } from "zod";
import { supabase, configured } from "@/lib/supabase/server";
export async function login(form: FormData) {
  if (!configured()) redirect("/login?error=config");
  const email = z.email().safeParse(form.get("email"));
  if (!email.success) redirect("/login?error=email");
  const db = await supabase();
  const { error } = await db.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${appOrigin()}/auth/confirm` },
  });
  if (error) {
    console.error("Supabase OTP send failed", {
      code: error.code || "unknown",
      status: error.status,
      name: error.name,
    });
    redirect(`/login?error=${sendErrorReason(error)}`);
  }
  redirect("/login?sent=1");
}
export async function logout() {
  const db = await supabase();
  await db.auth.signOut();
  redirect("/login");
}
