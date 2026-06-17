import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export type TagColor = "brand" | "up" | "down" | "gray" | "orange" | "blue" | "gold";
export type TagSize = "sm" | "md";

const COLORS: Record<TagColor, string> = {
  brand: "bg-purple-50 text-purple-700",
  up: "bg-green-100 text-green-700",
  down: "bg-red-100 text-red-700",
  gray: "bg-gray-100 text-gray-700",
  orange: "bg-orange-100 text-orange-700",
  blue: "bg-blue-100 text-blue-700",
  gold: "bg-gold-100 text-gold-800",
};
const HOVER: Record<TagColor, string> = {
  brand: "hover:bg-purple-200/70",
  up: "hover:bg-green-200/70",
  down: "hover:bg-red-200/70",
  gray: "hover:bg-gray-200/80",
  orange: "hover:bg-orange-200/70",
  blue: "hover:bg-blue-200/70",
  gold: "hover:bg-gold-200/70",
};

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: TagColor;
  size?: TagSize;
  /** show an x button; calls `onRemove` */
  onRemove?: () => void;
  leftIcon?: React.ReactNode;
}

/** Small removable chip — distinct from Badge by its rounded-[8px] shape + remove button. */
export function Tag({
  color = "gray",
  size = "md",
  onRemove,
  leftIcon,
  className,
  children,
  ...rest
}: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[8px] font-medium whitespace-nowrap",
        size === "sm" ? "h-6 pl-2 text-[11px]" : "h-7 pl-2.5 text-[12.5px]",
        onRemove ? (size === "sm" ? "pr-1" : "pr-1.5") : size === "sm" ? "pr-2" : "pr-2.5",
        COLORS[color],
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            "inline-flex items-center justify-center rounded-[5px] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300",
            size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]",
            HOVER[color],
          )}
        >
          <X size={size === "sm" ? 11 : 12} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}
