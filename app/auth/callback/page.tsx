import dynamic from "next/dynamic";

const CallbackHandler = dynamic(
  () => import("@/components/auth/CallbackHandler"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

export default function AuthCallbackPage() {
  return <CallbackHandler />;
}
