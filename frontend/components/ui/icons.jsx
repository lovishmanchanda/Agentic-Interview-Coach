/**
 * The icon set: 24-px stroke icons drawn inline (no icon font, no download). Decorative by default;
 * give the surrounding control an accessible name.
 */
function Icon({ className = "size-5", children, strokeWidth = 1.6 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
      strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

export const HomeIcon = (p) => <Icon {...p}><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v9h12v-9" /></Icon>;
export const DeskIcon = (p) => <Icon {...p}><path d="M3 10h18" /><path d="M5 10v9M19 10v9" /><path d="M8 10 10 5h4l-1 5" /></Icon>;
export const ChairIcon = (p) => <Icon {...p}><path d="M8 4l1.5 9h7" /><path d="M9.5 13 8.5 20M16.5 13l1 7" /></Icon>;
export const ChatIcon = (p) => <Icon {...p}><path d="M5 5h14v10H9l-4 4z" /></Icon>;
export const UserIcon = (p) => <Icon {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></Icon>;
export const ChartIcon = (p) => <Icon {...p}><path d="M4 19h16" /><path d="M7 16v-5M12 16V7M17 16v-8" /></Icon>;
export const ArrowRightIcon = (p) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const CheckIcon = (p) => <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
export const XIcon = (p) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const AlertIcon = (p) => <Icon {...p}><path d="M12 4 3 20h18z" /><path d="M12 10v4M12 17h.01" /></Icon>;
export const InfoIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></Icon>;
export const EyeIcon = (p) => <Icon {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const EyeOffIcon = (p) => <Icon {...p}><path d="M4 4l16 16" /><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.7M6.6 7.6C4 9.3 2.5 12 2.5 12S6 18 12 18c1.5 0 2.8-.3 4-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Icon>;
export const SearchIcon = (p) => <Icon {...p}><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></Icon>;
export const SparkIcon = (p) => <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></Icon>;
export const CodeIcon = (p) => <Icon {...p}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" /></Icon>;
export const LogoutIcon = (p) => <Icon {...p}><path d="M14 5h5v14h-5" /><path d="M10 8l-4 4 4 4M6 12h10" /></Icon>;
export const MenuIcon = (p) => <Icon {...p}><path d="M4 8h16M4 16h16" /></Icon>;
export const ShieldIcon = (p) => <Icon {...p}><path d="M12 3 5 6v6c0 4.2 3 7.5 7 9 4-1.5 7-4.8 7-9V6z" /></Icon>;
