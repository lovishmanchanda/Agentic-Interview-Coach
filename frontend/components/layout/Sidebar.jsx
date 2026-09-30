"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import Logo from "@/components/brand/Logo";
import Badge from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/interview/configure", match: "/interview", label: "Interview", icon: "M4 5h16v10H8l-4 4V5z" },
  { href: "/mentor", label: "ARIA · Mentor", icon: "M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8l5.5-.8L12 3z" },
  { href: "/profile", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0" },
];

const ADMIN_ITEM = { href: "/admin", label: "Admin", icon: "M4 19h16M7 16V9m5 7V5m5 11v-4" };

export default function Sidebar({ open, onNavigate }) {
  const pathname = usePathname();
  const isAdmin = useAuthStore((s) => Boolean(s.user?.is_admin));
  // is_admin comes from /users/me (the login response doesn't carry it).
  useEffect(() => {
    api.users.me().then((me) => useAuthStore.getState().setUser(me)).catch(() => {});
  }, []);
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-surface transition-transform md:static md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <Logo />
      </div>
      <nav aria-label="Main" className="space-y-1 p-3">
        {items.map((item) => {
          const base = item.match ?? item.href;
          const active = pathname === base || pathname.startsWith(`${base}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={item.icon} />
              </svg>
              <span className="flex-1">{item.label}</span>
              {item.soon && <Badge>{item.soon}</Badge>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
