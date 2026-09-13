"use client";
import * as React from "react";
import { Building2 } from "lucide-react";
import { Button, Card, Input, Switch, Tag } from "@/components/ui";
import { usd, signedUsd } from "@/lib/format";
import type { AlphaVenueDto } from "./types";

// Phase 1 has exactly one real venue (docs/alpha/plans/phase-1-core.md's
// scope cut — every other VenueId in src/lib/alpha/core/venue.ts lands in
// Phase 2+). Mirrors service.ts's DEFAULT_VENUE_CAPS so an unprovisioned row
// (nothing PATCHed yet — GET never auto-creates, only setVenue does) still
// renders real-looking defaults instead of blanks.
const PHASE_1_VENUE = "zoqo-terminal";
const DEFAULTS = { maxStake: 100, dailyCap: 500, dailyLossStop: 200 };

interface VenuePatch {
  venue: string;
  enabled?: boolean;
  maxStake?: number;
  dailyCap?: number;
  dailyLossStop?: number;
}

export function VenuesSection({
  venues,
  onSave,
}: {
  venues: AlphaVenueDto[];
  onSave: (patch: VenuePatch) => void;
}) {
  const row = venues.find((v) => v.venue === PHASE_1_VENUE);
  const [maxStake, setMaxStake] = React.useState(row?.maxStake ?? DEFAULTS.maxStake);
  const [dailyCap, setDailyCap] = React.useState(row?.dailyCap ?? DEFAULTS.dailyCap);
  const [dailyLossStop, setDailyLossStop] = React.useState(row?.dailyLossStop ?? DEFAULTS.dailyLossStop);
  const [dirty, setDirty] = React.useState(false);

  // Follow the server's numbers whenever they change underneath us (e.g.
  // after a save round-trips), but only while the user hasn't started
  // editing locally. React's "adjust state during render" pattern (same as
  // CreateAutomationModal's reset-on-open block) rather than a useEffect —
  // an effect that calls setState synchronously on every render where the
  // source values changed is exactly what that hook is for avoiding.
  const rowKey = row ? `${row.maxStake}:${row.dailyCap}:${row.dailyLossStop}` : "unset";
  const [syncedKey, setSyncedKey] = React.useState(rowKey);
  if (!dirty && syncedKey !== rowKey) {
    setSyncedKey(rowKey);
    setMaxStake(row?.maxStake ?? DEFAULTS.maxStake);
    setDailyCap(row?.dailyCap ?? DEFAULTS.dailyCap);
    setDailyLossStop(row?.dailyLossStop ?? DEFAULTS.dailyLossStop);
  }

  function save() {
    onSave({ venue: PHASE_1_VENUE, maxStake, dailyCap, dailyLossStop });
    setDirty(false);
  }

  return (
    <section>
      <h2 className="text-[17px] font-bold text-ink">Venues</h2>
      <Card padding="lg" className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-purple-50 text-purple-600">
              <Building2 size={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[14.5px] font-bold text-ink">Zoqo Terminal</h3>
                <Tag color="gray" size="sm">
                  paper
                </Tag>
              </div>
              <p className="mt-0.5 text-[12px] text-sub">
                Spent today {usd(row?.spentToday ?? 0)} · P&amp;L today{" "}
                <span className={(row?.pnlToday ?? 0) >= 0 ? "text-green-600" : "text-red-600"}>
                  {signedUsd(row?.pnlToday ?? 0)}
                </span>
              </p>
            </div>
          </div>
          <Switch
            checked={row?.enabled ?? false}
            onChange={(enabled) => onSave({ venue: PHASE_1_VENUE, enabled })}
            color="up"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-[12px] font-semibold text-sub">Max stake</label>
            <Input
              type="number"
              value={maxStake}
              onChange={(e) => {
                setDirty(true);
                setMaxStake(e.target.value === "" ? 0 : Number(e.target.value));
              }}
              leftSection="$"
              min={1}
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-sub">Daily cap</label>
            <Input
              type="number"
              value={dailyCap}
              onChange={(e) => {
                setDirty(true);
                setDailyCap(e.target.value === "" ? 0 : Number(e.target.value));
              }}
              leftSection="$"
              min={1}
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-sub">Daily loss stop</label>
            <Input
              type="number"
              value={dailyLossStop}
              onChange={(e) => {
                setDirty(true);
                setDailyLossStop(e.target.value === "" ? 0 : Number(e.target.value));
              }}
              leftSection="$"
              min={1}
              className="mt-1.5"
            />
          </div>
        </div>

        {dirty && (
          <div className="mt-3 flex justify-end">
            <Button color="brand" size="sm" onClick={save}>
              Save changes
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}
