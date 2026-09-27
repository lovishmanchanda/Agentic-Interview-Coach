import { Suspense } from "react";

import LoginForm from "@/components/auth/LoginForm";
import Spinner from "@/components/ui/Spinner";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    // LoginForm reads ?next= with useSearchParams, which needs a Suspense boundary.
    <Suspense fallback={<Spinner label="Loading…" />}>
      <LoginForm />
    </Suspense>
  );
}
