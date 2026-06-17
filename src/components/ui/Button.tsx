import * as React from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "solid" | "soft" | "outline" | "ghost";
export type ButtonColor =
  | "brand" | "up" | "down" | "gray" | "orange" | "blue" | "gold";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-[12px] gap-1 rounded-[8px]",
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[8px]",
  md: "h-10 px-4 text-[14px] gap-2 rounded-[10px]",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-[12px]",
  xl: "h-14 px-6 text-[16px] gap-2.5 rounded-[14px]",
};

// [solid, soft, outline, ghost] classes per color
const COLORS: Record<ButtonColor, Record<ButtonVariant, string>> = {
  brand: {
    solid: "bg-purple-500 text-white hover:bg-purple-600 active:bg-purple-700 shadow-[0_8px_24px_rgba(96,31,255,0.28)]",
    soft: "bg-purple-50 text-purple-700 hover:bg-purple-100",
    outline: "border border-purple-500 text-purple-600 hover:bg-purple-50",
    ghost: "text-purple-600 hover:bg-purple-50",
  },
  up: {
    solid: "bg-green-500 text-white hover:bg-green-600 active:bg-green-700",
    soft: "bg-green-100 text-green-700 hover:bg-green-200",
    outline: "border border-green-500 text-green-600 hover:bg-green-50",
    ghost: "text-green-600 hover:bg-green-50",
  },
  down: {
    solid: "bg-red-500 text-white hover:bg-red-600 active:bg-red-700",
    soft: "bg-red-100 text-red-700 hover:bg-red-200",
    outline: "border border-red-500 text-red-600 hover:bg-red-50",
    ghost: "text-red-600 hover:bg-red-50",
  },
  gray: {
    solid: "bg-gray-900 text-white hover:bg-gray-800",
    soft: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    outline: "border border-line-strong text-ink hover:bg-gray-50",
    ghost: "text-sub hover:bg-gray-100",
  },
  orange: {
    solid: "bg-orange-500 text-white hover:bg-orange-600",
    soft: "bg-orange-100 text-orange-700 hover:bg-orange-200",
    outline: "border border-orange-500 text-orange-600 hover:bg-orange-50",
    ghost: "text-orange-600 hover:bg-orange-50",
  },
  blue: {
    solid: "bg-blue-500 text-white hover:bg-blue-600",
    soft: "bg-blue-100 text-blue-700 hover:bg-blue-200",
    outline: "border border-blue-500 text-blue-600 hover:bg-blue-50",
    ghost: "text-blue-600 hover:bg-blue-50",
  },
  gold: {
    solid: "bg-gold-500 text-gray-900 hover:bg-gold-600",
    soft: "bg-gold-100 text-gold-800 hover:bg-gold-200",
    outline: "border border-gold-500 text-gold-700 hover:bg-gold-50",
    ghost: "text-gold-700 hover:bg-gold-50",
  },
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  color?: ButtonColor;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "solid",
      color = "brand",
      size = "md",
      fullWidth,
      loading,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-semibold whitespace-nowrap select-none",
          "transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-1",
          "disabled:opacity-45 disabled:pointer-events-none",
          SIZES[size],
          COLORS[color][variant],
          fullWidth && "w-full",
          className,
        )}
        {...rest}
      >
        {loading && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
        )}
        {!loading && leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  },
);
