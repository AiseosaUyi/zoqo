"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlertVariant = "info" | "success" | "warning" | "error";

const STYLES: Record<
  AlertVariant,
  { wrap: string; icon: string; title: string; Icon: React.ElementType }
> = {
  info: {
    wrap: "bg-blue-50 border-blue-200",
    icon: "text-blue-500",
    title: "text-blue-800",
    Icon: Info,
  },
  success: {
    wrap: "bg-green-50 border-green-200",
    icon: "text-green-600",
    title: "text-green-800",
    Icon: CheckCircle2,
  },
  warning: {
    wrap: "bg-gold-50 border-gold-200",
    icon: "text-gold-600",
    title: "text-gold-800",
    Icon: AlertTriangle,
  },
  error: {
    wrap: "bg-red-50 border-red-200",
    icon: "text-red-500",
    title: "text-red-800",
    Icon: XCircle,
  },
};

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: AlertVariant;
  title?: React.ReactNode;
  icon?: React.ReactNode | false;
  dismissible?: boolean;
  onDismiss?: () => void;
}

/** Callout / banner with semantic variants, icon, title and optional dismiss. */
export function Alert({
  variant = "info",
  title,
  icon,
  dismissible,
  onDismiss,
  className,
  children,
  ...rest
}: AlertProps) {
  const s = STYLES[variant];
  const Icon = s.Icon;
  return (
    <div
      role="alert"
      className={cn("flex gap-3 rounded-[12px] border p-3.5", s.wrap, className)}
      {...rest}
    >
      {icon !== false && (
        <span className={cn("mt-0.5 shrink-0", s.icon)}>
          {icon ?? <Icon size={18} />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && (
          <div className={cn("text-[13.5px] font-bold leading-snug", s.title)}>{title}</div>
        )}
        {children && (
          <div className={cn("text-[13px] leading-relaxed text-ink/80", title && "mt-0.5")}>
            {children}
          </div>
        )}
      </div>
      {dismissible && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className={cn(
            "-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-colors",
            "hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300",
            s.icon,
          )}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
