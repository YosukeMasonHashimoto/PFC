import { redirect } from "next/navigation";
import { supabase, configured } from "@/lib/supabase/server";
import Tracker from "@/components/tracker";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!configured()) redirect("/login");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  return <Tracker />;
}
