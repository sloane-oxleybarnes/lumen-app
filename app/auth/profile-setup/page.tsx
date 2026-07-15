import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { hasApprovedBetaAccess } from "@/lib/beta-access";

const ProfileSetupForm = dynamic(() => import("@/components/auth/ProfileSetupForm"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

export default async function ProfileSetupPage() {
  const supabase = createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", session.user.id)
    .maybeSingle();
  const approved = await hasApprovedBetaAccess({ email: session.user.email, plan: profile?.plan });
  if (!approved) {
    await supabase.auth.signOut();
    redirect("/beta?access=approval-required");
  }

  return <ProfileSetupForm />;
}
