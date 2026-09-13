"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { Cpu, X } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import type { AlphaTemplateDto } from "./types";

export interface CreateStrategyInput {
  strategyKey: string;
  name: string;
  venue: string;
  budget: number;
  maxStake: number;
  dailyCap: number;
  dailyLossStop: number;
  schedule?: { kind: "interval"; everyMin: number };
}

/** "Create from template" — the modal opened by a template card in
 *  StrategiesSection. Follows CreateAutomationModal's createPortal /
 *  fixed-overlay / bg-surface shape (that file for the pattern this one
 *  mirrors), simplified: Phase 1's templates only ever target one venue
 *  each today, so there's no asset/condition picker to build, just the
 *  budget/cap numbers and (if the template runs on an interval) how often. */
export function CreateStrategyModal({
  open,
  onClose,
  template,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  template: AlphaTemplateDto | null;
  onCreate: (input: CreateStrategyInput) => void;
}) {
  const [name, setName] = React.useState("");
  const [venue, setVenue] = React.useState("");
  const [budget, setBudget] = React.useState(500);
  const [maxStake, setMaxStake] = React.useState(50);
  const [dailyCap, setDailyCap] = React.useState(200);
  const [dailyLossStop, setDailyLossStop] = React.useState(100);
  const [everyMin, setEveryMin] = React.useState(60);
  const [resetForKey, setResetForKey] = React.useState<string | null>(null);

  if (open && template && resetForKey !== template.key) {
    setResetForKey(template.key);
    setName(template.key.replace(/-/g, " "));
    setVenue(template.venues[0] ?? "");
    setBudget(500);
    setMaxStake(50);
    setDailyCap(200);
    setDailyLossStop(100);
    setEveryMin(template.schedule.everyMin ?? 60);
  } else if (!open && resetForKey) {
    setResetForKey(null);
  }

  if (!open || !template || typeof document === "undefined") return null;

  function submit() {
    if (!template) return;
    onCreate({
      strategyKey: template.key,
      name: name.trim() || template.key,
      venue,
      budget,
      maxStake,
      dailyCap,
      dailyLossStop,
      schedule: template.schedule.kind === "interval" ? { kind: "interval", everyMin } : undefined,
    });
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-gray-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-[440px] overflow-hidden rounded-[20px] border bg-surface shadow-[0_24px_64px_rgba(14,17,19,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-display text-[19px] font-black leading-none">New Strategy</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-gray-100">
            <X size={18} className="text-sub" />
          </button>
        </div>

        <div className="px-5 py-4">
          <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-brand">
            <Cpu size={18} />
          </span>

          <label className="block text-[12px] font-semibold text-sub">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" maxLength={40} autoFocus />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-sub">Venue</label>
              <Select
                className="mt-1.5"
                value={venue}
                onChange={setVenue}
                data={template.venues.map((v) => ({ value: v, label: v }))}
              />
            </div>
            {template.schedule.kind === "interval" && (
              <div>
                <label className="block text-[12px] font-semibold text-sub">Runs every</label>
                <Input
                  type="number"
                  value={everyMin}
                  onChange={(e) => setEveryMin(e.target.value === "" ? 1 : Number(e.target.value))}
                  rightSection="min"
                  min={1}
                  className="mt-1.5"
                />
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-sub">Budget</label>
              <Input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value === "" ? 0 : Number(e.target.value))}
                leftSection="$"
                min={1}
                className="mt-1.5"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-sub">Max stake</label>
              <Input
                type="number"
                value={maxStake}
                onChange={(e) => setMaxStake(e.target.value === "" ? 0 : Number(e.target.value))}
                leftSection="$"
                min={1}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-sub">Daily cap</label>
              <Input
                type="number"
                value={dailyCap}
                onChange={(e) => setDailyCap(e.target.value === "" ? 0 : Number(e.target.value))}
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
                onChange={(e) => setDailyLossStop(e.target.value === "" ? 0 : Number(e.target.value))}
                leftSection="$"
                min={1}
                className="mt-1.5"
              />
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-sub">
            Created disabled — flip it on from the strategy list once you&apos;re ready for it to actually run.
          </p>

          <Button color="brand" fullWidth size="lg" onClick={submit} disabled={!venue} className="mt-4">
            Create strategy
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
