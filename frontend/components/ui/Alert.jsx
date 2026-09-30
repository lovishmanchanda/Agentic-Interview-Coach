const TONES = {
  error: "border-danger/30 bg-danger-soft text-danger",
  success: "border-success/30 bg-success-soft text-success",
  info: "border-steel/30 bg-steel-soft text-foreground", // steel, not orange: orange is kept for actions
  warning: "border-warning/30 bg-warning-soft text-warning",
};

export default function Alert({ tone = "info", title, children }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}
