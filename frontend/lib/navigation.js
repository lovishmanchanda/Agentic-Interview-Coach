import { ChairIcon, ChartIcon, ChatIcon, DeskIcon, UserIcon } from "@/components/ui/icons";

/**
 * The app's destinations, shared by the sidebar, the phone tab bar and the command palette.
 * `match`: the path prefix that marks the item active (defaults to href).
 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Desk", hint: "Your reports and what's next", Icon: DeskIcon },
  { href: "/interview/configure", match: "/interview", label: "Interview", hint: "Take the seat with VERA", Icon: ChairIcon },
  { href: "/mentor", label: "ARIA", hint: "Your mentor", Icon: ChatIcon },
  { href: "/profile", label: "Profile", hint: "Role, skills and preferences", Icon: UserIcon },
];

export const ADMIN_ITEM = { href: "/admin", label: "Admin", hint: "Metrics, usage and prompts", Icon: ChartIcon };

export function isActive(item, pathname) {
  const base = item.match ?? item.href;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** The title shown in the top bar for a path. */
export function pageTitle(pathname) {
  if (pathname.startsWith("/interview/session")) return "Interview";
  if (pathname.startsWith("/interview/report")) return "Report";
  if (pathname.startsWith("/interview")) return "New interview";
  if (pathname.startsWith("/dashboard")) return "Your desk";
  if (pathname.startsWith("/mentor")) return "ARIA";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/admin")) return "Admin";
  return "";
}

/** Focus pages hide the phone tab bar and the status bar: nothing should compete with the question. */
export const isFocusPage = (pathname) => pathname.startsWith("/interview/session");
