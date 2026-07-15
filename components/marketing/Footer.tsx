import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border mt-24 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative h-8 w-32">
            <Image
              src="/brand/beckett-horizontal-logo.png"
              alt="Beckett"
              fill
              sizes="128px"
              className="object-contain object-left"
            />
          </div>
          <div className="flex items-center gap-6 text-sm text-ink-light">
            <Link href="/features" className="hover:text-ink transition-colors">
              Features
            </Link>
            <Link href="/pricing" className="hover:text-ink transition-colors">
              Pricing
            </Link>
            <Link href="/beta" className="hover:text-ink transition-colors">
              Beta
            </Link>
            <Link href="/privacy" className="hover:text-ink transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink transition-colors">
              Terms
            </Link>
            <Link href="/auth/login" className="hover:text-ink transition-colors">
              Sign in
            </Link>
          </div>
          <p className="text-sm text-ink-light">
            &copy; {new Date().getFullYear()} Beckett Labs Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
