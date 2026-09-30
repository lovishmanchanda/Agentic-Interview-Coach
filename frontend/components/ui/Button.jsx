import Link from "next/link";

import Spinner from "./Spinner";

/**
 * Buttons. Primary is the one orange action per view (a faint top highlight and an orange under-glow);
 * secondary is glassy grey; ghost is text-like; danger is for destructive actions.
 * md and lg are at least 44 px tall (touch targets). With `href` it renders a link styled the same.
 */
const VARIANTS = {
  primary:
    "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_10px_30px_-14px_var(--primary)] hover:bg-primary-hover",
  secondary: "border border-border-strong bg-raised/70 text-foreground backdrop-blur hover:border-subtle hover:bg-raised",
  ghost: "text-muted hover:bg-raised hover:text-foreground",
  danger: "bg-danger text-primary-foreground hover:opacity-90",
};

const SIZES = {
  sm: "h-9 rounded-lg px-3.5 text-sm pointer-coarse:h-11", // 44 px on touch screens
  md: "h-11 rounded-xl px-5 text-sm",
  lg: "h-13 rounded-xl px-6 text-base",
};

export default function Button({ variant = "primary", size = "md", loading = false, href, className = "", children, disabled, ...props }) {
  const classes = `inline-flex select-none items-center justify-center gap-2 font-medium transition-[background-color,border-color,color,transform,box-shadow] duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}
