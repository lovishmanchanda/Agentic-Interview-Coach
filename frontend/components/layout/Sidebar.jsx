"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import Logo, { LogoMark } from "@/components/brand/Logo";
import { SearchIcon } from "@/components/ui/icons";
import Kbd from "@/components/ui/Kbd";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { ADMIN_ITEM, NAV_ITEMS, isActive } from "@/lib/navigation";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";

function Chevron({ collapsed }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="m14 7-5 5 5 5" />
    </svg>
  );
}

/**
 * Desktop navigation: a sidebar that collapses to an icon rail (remembered per browser). The active item
 * carries an orange pill that slides between items. Admin appears only for admins. (Phones use the bottom
 * tab bar instead.)
 */
export default function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const openPalette = useUiStore((s) => s.setPaletteOpen);
  const isAdmin = useAuthStore((s) => Boolean(s.user?.is_admin));
  // is_admin comes from /users/me (the login response doesn't carry it).
  useEffect(() => {
    api.users.me().then((me) => useAuthStore.getState().setUser(me)).catch(() => {});
  }, []);
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  return (
    <aside
      className={`sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border/70 bg-surface/60 backdrop-blur-xl transition-[width] duration-300 ease-out md:flex ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      <div className={`flex h-16 items-center border-b border-border/70 ${collapsed ? "justify-center" : "px-5"}`}>
        <Link href="/" aria-label="InterviewOS home">{collapsed ? <LogoMark /> : <Logo />}</Link>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const active = isActive(item, pathname);
          const link = (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={`relative flex h-11 items-center gap-3 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                collapsed ? "w-[50px] justify-center" : "px-3"
              } ${active ? "text-foreground" : "text-muted hover:bg-raised/70 hover:text-foreground"}`}
            >
              {active && (
                <motion.span layoutId="nav-pill" transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
                  className="absolute inset-0 rounded-xl border border-primary/25 bg-primary-soft">
                  <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-primary" />
                </motion.span>
              )}
              <item.Icon className={`relative size-5 shrink-0 ${active ? "text-primary" : ""}`} />
              {!collapsed && <span className="relative">{item.label}</span>}
            </Link>
          );
          return collapsed ? <Tooltip key={item.href} content={item.label} side="right">{link}</Tooltip> : link;
        })}
      </nav>

      <div className="space-y-2 border-t border-border/70 p-3">
        <button type="button" onClick={() => openPalette(true)} aria-label="Quick actions (Command or Control + K)"
          className={`flex h-10 w-full items-center gap-2 rounded-xl border border-border text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground ${collapsed ? "justify-center" : "px-3"}`}>
          <SearchIcon className="size-4" />
          {!collapsed && (<><span className="flex-1 text-left">Quick actions</span><Kbd>⌘K</Kbd></>)}
        </button>
        <button type="button" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}
          className={`flex h-9 w-full items-center gap-2 rounded-lg text-xs text-muted hover:text-foreground ${collapsed ? "justify-center" : "px-3"}`}>
          <Chevron collapsed={collapsed} />
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
