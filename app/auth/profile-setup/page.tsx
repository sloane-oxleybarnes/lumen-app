import dynamic from "next/dynamic";

const ProfileSetupForm = dynamic(() => import("@/components/auth/ProfileSetupForm"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

export default function ProfileSetupPage() {
  return <ProfileSetupForm />;
}
