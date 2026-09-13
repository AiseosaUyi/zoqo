"use client";
import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { Card, Switch, Tag } from "@/components/ui";
import type { AlphaSettingsDto } from "./types";

/** The one control every other Alpha surface answers to: flipping this off
 *  doesn't just stop new decisions — risk.ts's gate checks it on every
 *  intent, so an in-flight run rejects everything the instant this flips
 *  (see docs/alpha/03-architecture.md §5's 7-point gate, point 1). */
export function KillSwitchCard({
  settings,
  onToggle,
}: {
  settings: AlphaSettingsDto;
  onToggle: (on: boolean) => void;
}) {
  return (
    <Card padding="lg" className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          className={
            "grid h-10 w-10 shrink-0 place-items-center rounded-full " +
            (settings.killSwitch ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600")
          }
        >
          <ShieldAlert size={18} />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-ink">Kill switch</h2>
            <Tag color={settings.killSwitch ? "down" : "up"} size="sm">
              {settings.killSwitch ? "Halted" : "Live"}
            </Tag>
          </div>
          <p className="mt-0.5 text-[12.5px] text-sub">
            Switching this on immediately blocks every strategy from placing a new order, across every venue.
          </p>
        </div>
      </div>
      <Switch checked={!settings.killSwitch} onChange={(on) => onToggle(!on)} color="up" size="md" />
    </Card>
  );
}
