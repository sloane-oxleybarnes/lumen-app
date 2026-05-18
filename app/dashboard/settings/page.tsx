import dynamic from "next/dynamic";

const SettingsPanel = dynamic(
  () => import("@/components/dashboard/SettingsPanel"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

export default function SettingsPage() {
  return <SettingsPanel />;
}
