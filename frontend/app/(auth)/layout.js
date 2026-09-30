import AuthShell from "@/components/auth/AuthShell";

/**
 * /login and /register share this layout, which holds the one auth card. Moving between them keeps the
 * layout (and the card) mounted, so the card morphs instead of reloading. The pages only set the title.
 */
export default function AuthLayout({ children }) {
  return <AuthShell>{children}</AuthShell>;
}
