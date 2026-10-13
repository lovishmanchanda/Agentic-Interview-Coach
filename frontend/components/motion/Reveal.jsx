/**
 * Reveal-on-scroll, in CSS (app/globals.css, `.reveal`): each block fades and lifts in as it enters the
 * viewport, driven by the scroll position itself (a scroll-driven animation, `animation-timeline: view()`), so
 * the browser runs it off the main thread and no JavaScript ships for it. Server components can use it too.
 * Where the browser lacks scroll-driven animations, or motion is reduced, the content is simply there.
 *
 *   delay  starts the reveal a little later in the scroll (seconds in the old timed version ≈ a later start)
 *   y      how far it rises, in px
 */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];

export default function Reveal({ as: Tag = "div", delay = 0, y = 16, className = "", style, children, ...props }) {
  return (
    <Tag className={`reveal ${className}`} style={{ "--reveal-delay": delay, "--reveal-y": `${y}px`, ...style }} {...props}>
      {children}
    </Tag>
  );
}

/** A group whose items (<StaggerItem>) reveal one after another as the group scrolls in. */
export function Stagger({ as: Tag = "div", className = "", children, ...props }) {
  return <Tag className={`reveal-stagger ${className}`} {...props}>{children}</Tag>;
}

export function StaggerItem({ as: Tag = "div", className = "", children, ...props }) {
  return <Tag className={`reveal ${className}`} {...props}>{children}</Tag>;
}
