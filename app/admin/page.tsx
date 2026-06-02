import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import AdminLoginForm from "./LoginForm";
import AdminApprovalList from "./ApprovalList";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = cookies();
  const isAuthed =
    cookieStore.get("admin_auth")?.value === process.env.ADMIN_PASSWORD;

  if (!isAuthed) {
    return <AdminLoginForm />;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: signups } = await supabase
    .from("beta_signups")
    .select("id, email, name, created_at, approved")
    .eq("approved", false)
    .order("created_at", { ascending: false });

  return <AdminApprovalList signups={signups || []} />;
}
