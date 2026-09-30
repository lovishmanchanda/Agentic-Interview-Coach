import Link from "next/link";

import Logo from "@/components/brand/Logo";
import RedirectIfSignedIn from "@/components/layout/RedirectIfSignedIn";

export default function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <RedirectIfSignedIn />
      <Link href="/" aria-label="InterviewOS home" className="mb-8 text-lg">
        <Logo markClassName="size-9" />
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">{children}</div>
    </div>
  );
}
