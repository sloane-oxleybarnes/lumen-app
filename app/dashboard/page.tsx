import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import FreeDashboard from "@/components/dashboard/FreeDashboard";
import ProDashboard from "@/components/dashboard/ProDashboard";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  const name =
    profile?.full_name?.split(" ")[0] ||
    session.user.email?.split("@")[0] ||
    "there";
  const plan = profile?.plan || "free";

  if (plan === "free") {
    return <FreeDashboard name={name} userEmail={session.user.email || ""} />;
  }

  return <ProDashboard name={name} plan={plan} />;
}
