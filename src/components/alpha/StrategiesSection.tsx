"use client";
import * as React from "react";
import { Cpu, Play } from "lucide-react";
import { Button, Card, EmptyState, Switch, Tag } from "@/components/ui";
import { usd, ageShort } from "@/lib/format";
import { CreateStrategyModal, type CreateStrategyInput } from "./CreateStrategyModal";
import type { AlphaStrategyDto, AlphaTemplateDto } from "./types";

function scheduleLabel(schedule: unknown): string {
  const s = schedule as { kind?: string; everyMin?: number; expr?: string; on?: string } | null;
  if (!s || typeof s !== "object") return "—";
  if (s.kind === "interval") return `every ${s.everyMin ?? "?"} min`;
  if (s.kind === "cron") return `cron "${s.expr ?? "?"}"`;
  if (s.kind === "event") return `on ${s.on ?? "?"}`;
  return "—";
}

function lastRunLabel(iso: string | null): string {
  if (!iso) return "never";
  return `${ageShort(Date.now() - new Date(iso).getTime())} ago`;
}

function nextRunLabel(iso: string): string {
  const delta = new Date(iso).getTime() - Date.now();
  return delta >= 0 ? `in ${ageShort(delta)}` : `overdue by ${ageShort(-delta)}`;
}

/** Registry templates ("available to add") + the caller's own strategy
 *  instances — enable/disable (routed through pause/resume so an
 *  alpha_events row gets logged, not a bare PATCH), Run now, budget/caps,
 *  schedule, last/next run. Editing an existing instance's numbers isn't
 *  built here (Phase 1 scope per docs/alpha/plans/phase-1-core.md — the
 *  create flow is the one place those get set); this only adds and
 *  starts/stops/runs. */
export function StrategiesSection({
  templates,
  strategies,
  onCreate,
  onRunNow,
  onPause,
  onResume,
}: {
  templates: AlphaTemplateDto[];
  strategies: AlphaStrategyDto[];
  onCreate: (input: CreateStrategyInput) => void;
  onRunNow: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const [modalTemplate, setModalTemplate] = React.useState<AlphaTemplateDto | null>(null);

  return (
    <section>
      <h2 className="text-[17px] font-bold text-ink">Strategies</h2>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.key} padding="md" className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-ink">{t.key.replace(/-/g, " ")}</p>
              <p className="mt-0.5 text-[11.5px] text-sub">
                {t.venues.join(", ")} · {scheduleLabel(t.schedule)}
              </p>
            </div>
            <Button size="sm" color="brand" variant="outline" onClick={() => setModalTemplate(t)}>
              Add
            </Button>
          </Card>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {strategies.length === 0 && (
          <EmptyState
            icon={Cpu}
            title="No strategies yet"
            description="Add one of the templates above to get a real, budget-capped strategy running."
          />
        )}
        {strategies.map((s) => (
          <Card key={s.id} padding="md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-[14px] font-bold text-ink">{s.name}</h3>
                  <Tag color="gray" size="sm">
                    {s.venue}
                  </Tag>
                  {s.paused_reason && (
                    <Tag color="orange" size="sm">
                      {s.paused_reason}
                    </Tag>
                  )}
                </div>
                <p className="mt-0.5 text-[11.5px] text-sub">
                  Budget {usd(s.budget)} · max {usd(s.max_stake)}/order · cap {usd(s.daily_cap)}/day ·{" "}
                  {scheduleLabel(s.schedule)}
                </p>
                <p className="mt-0.5 text-[11.5px] text-sub">
                  Last run {lastRunLabel(s.last_run_at)} · Next run {nextRunLabel(s.next_run_at)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => onRunNow(s.id)}>
                  <Play size={13} className="mr-1" /> Run now
                </Button>
                <Switch checked={s.enabled} onChange={(on) => (on ? onResume(s.id) : onPause(s.id))} color="up" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <CreateStrategyModal
        open={modalTemplate != null}
        onClose={() => setModalTemplate(null)}
        template={modalTemplate}
        onCreate={onCreate}
      />
    </section>
  );
}
