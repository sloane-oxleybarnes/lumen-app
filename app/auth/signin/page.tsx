import dynamic from "next/dynamic";

const SigninForm = dynamic(() => import("@/components/auth/SigninForm"), { ssr: false });

export default function SigninPage() {
  return <SigninForm />;
}
