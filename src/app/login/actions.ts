"use server";
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
  redirect(error ? "/login?error=send" : "/login?sent=1");
}
export async function logout() {
  const db = await supabase();
  await db.auth.signOut();
  redirect("/login");
}
