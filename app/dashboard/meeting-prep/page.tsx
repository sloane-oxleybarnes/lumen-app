import MeetingPrepPanel from "./MeetingPrepPanel";
import { redirect } from "next/navigation";

export default function MeetingPrepPage({ searchParams }: { searchParams: { title?: string } }) {
  if (!searchParams.title) redirect("/dashboard/calendar");
  return <MeetingPrepPanel />;
}
