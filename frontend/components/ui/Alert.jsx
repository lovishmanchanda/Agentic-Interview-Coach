import { AlertIcon, CheckIcon, InfoIcon } from "./icons";

/** An inline message. The icon and title carry the meaning too, never the colour alone. */
const TONES = {
  error: { className: "border-danger/30 bg-danger-soft", icon: "text-danger", Icon: AlertIcon },
  success: { className: "border-success/30 bg-success-soft", icon: "text-success", Icon: CheckIcon },
  info: { className: "border-steel/30 bg-steel-soft", icon: "text-steel", Icon: InfoIcon }, // steel, not orange: orange is kept for actions
  warning: { className: "border-warning/30 bg-warning-soft", icon: "text-warning", Icon: AlertIcon },
};

export default function Alert({ tone = "info", title, children }) {
  const { className, icon, Icon } = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${className}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${icon}`} />
      <div className="min-w-0">
        {title && <p className="font-medium text-foreground">{title}</p>}
        {children && <div className={`text-foreground/85 ${title ? "mt-0.5" : ""}`}>{children}</div>}
      </div>
    </div>
  );
}
