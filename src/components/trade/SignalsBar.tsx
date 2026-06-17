"use client";
import * as React from "react";
import { Activity, BarChart3 } from "lucide-react";
import { Switch } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface SignalsBarProps {
  showSignals: boolean;
  onToggleSignals: (v: boolean) => void;
  left?: React.ReactNode;
  className?: string;
}

export function SignalsBar({ showSignals, onToggleSignals, left, className }: SignalsBarProps) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center justify-between gap-3", className)}>
      <div>{left}</div>
      <div className="flex items-center gap-4">
        <span className="hidden items-center gap-1.5 text-[12px] text-sub sm:flex">
          <BarChart3 size={14} /> Volume
        </span>
        <span className="hidden items-center gap-1.5 text-[12px] text-sub sm:flex">
          <Activity size={14} /> Spikes
        </span>
        <Switch
          checked={showSignals}
          onChange={onToggleSignals}
          label={<span className={cn("font-medium", showSignals && "text-ink")}>Signals</span>}
        />
      </div>
    </div>
  );
}
