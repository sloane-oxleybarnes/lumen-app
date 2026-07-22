import { redirect } from "next/navigation";

export default function PersonalPage() {
  redirect("/dashboard/practice?mode=personal");
}
