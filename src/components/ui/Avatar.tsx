import * as React from "react";
import { cn } from "@/lib/cn";

const SIZES = {
  mini: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-[12px]",
  lg: "h-10 w-10 text-[14px]",
  xl: "h-12 w-12 text-[16px]",
};

// Deterministic, vibrant color from a seed string (ZOQO palette).
const RING = [
  "bg-purple-100 text-purple-700",
  "bg-green-100 text-green-700",
  "bg-orange-100 text-orange-700",
  "bg-blue-100 text-blue-700",
  "bg-red-100 text-red-700",
  "bg-gold-100 text-gold-800",
  "bg-brown-100 text-brown-700",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface AvatarProps {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({ name, size = "md", className }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const color = RING[hash(name) % RING.length];
  return (
    <span
      title={name}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold select-none",
        SIZES[size],
        color,
        className,
      )}
    >
      {initials}
    </span>
  );
}
