import PersonalCoachPanel from "./PersonalCoachPanel";
import Link from "next/link";

export default function PersonalPage() {
  return <><div className="mb-5 text-right"><Link href="/dashboard/personal/scenarios" className="text-sm font-medium text-primary hover:underline">Browse practice scenarios →</Link></div><PersonalCoachPanel /></>;
}
