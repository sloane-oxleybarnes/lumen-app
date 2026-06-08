import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import DashboardSidebar from "@/components/dashboard/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (!profile?.first_login_complete) {
    redirect("/auth/profile-setup");
  }

  return (
    <div className="min-h-screen bg-bg flex">
      <DashboardSidebar profile={profile} userEmail={session.user.email || ""} />
      <main className="flex-1 md:ml-64 p-4 md:p-8 pt-16 md:pt-8">{children}</main>
    </div>
  );
}
