import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { ensureApprovedBetaPlan, hasApprovedBetaAccess } from "@/lib/beta-access";
import { hasCurrentBetaConsent } from "@/lib/beta-consent";

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

  const approved = await hasApprovedBetaAccess({
    email: session.user.email,
    plan: profile?.plan,
  });
  if (!approved) {
    redirect("/beta?access=approval-required");
  }

  const effectivePlan = await ensureApprovedBetaPlan({
    userId: session.user.id,
    email: session.user.email,
    plan: profile?.plan,
  });
  const effectiveProfile = profile ? { ...profile, plan: effectivePlan } : profile;

  if (!effectiveProfile?.first_login_complete || !hasCurrentBetaConsent(effectiveProfile)) {
    redirect("/auth/profile-setup");
  }

  return (
    <DashboardShell profile={effectiveProfile} userEmail={session.user.email || ""}>
      {children}
    </DashboardShell>
  );
}
