import Link from "next/link";

import RedirectIfSignedIn from "@/components/layout/RedirectIfSignedIn";

export default function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <RedirectIfSignedIn />
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">AI</span>
        <span className="text-lg font-semibold">Interview Coach</span>
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">{children}</div>
    </div>
  );
}
