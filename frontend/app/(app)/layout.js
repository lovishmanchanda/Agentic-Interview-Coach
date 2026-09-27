import AppShell from "@/components/layout/AppShell";
import AuthGuard from "@/components/layout/AuthGuard";

export default function ProtectedLayout({ children }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
