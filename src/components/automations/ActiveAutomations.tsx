"use client";
import { Bot, Trash2 } from "lucide-react";
import { Card, EmptyState, Switch, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Automation } from "@/lib/automations";

/** "Sit back and relax" made tangible: the automations the user has actually
 *  created in this demo, persisted locally. The zero-automations case can be
 *  handled either here (pass `onCreate` and it shows a real `EmptyState`) or
 *  by the caller — if `onCreate` isn't passed, this renders nothing when
 *  empty, same as before. Either way it never silently renders nothing when
 *  the caller expected an empty-state affordance. */
export function ActiveAutomations({
  automations,
  onToggle,
  onRemove,
  onCreate,
}: {
  automations: Automation[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onCreate?: () => void;
}) {
  if (automations.length === 0) {
    if (!onCreate) return null;
    return (
      <section className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
        <EmptyState
          icon={Bot}
          title="Nothing on autopilot yet"
          description="Pick a template above and set your own numbers — the moment you create one, it lands here, ready to toggle or delete any time."
          action={{ label: "Create an automation", onClick: onCreate }}
        />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-bold text-ink">Your Active Automations</h2>
          <p className="mt-1 text-[13.5px] text-sub">
            {automations.length} automation{automations.length === 1 ? "" : "s"} · toggle to pause,
            or remove it entirely.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {automations.map((a) => (
          <Card key={a.id} padding="md" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-[10px]",
                a.enabled ? "bg-purple-50 text-purple-600" : "bg-gray-100 text-gray-400",
              )}
            >
              <Bot size={18} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-[14px] font-bold text-ink">{a.name}</h3>
                <Tag color="gray" size="sm">
                  {a.category}
                </Tag>
                {a.executionsCount != null && (
                  <Tag color="gray" size="sm">
                    {a.executionsCount} execution{a.executionsCount === 1 ? "" : "s"}
                  </Tag>
                )}
                {!a.enabled && (
                  <Tag color="gold" size="sm">
                    Paused
                  </Tag>
                )}
              </div>
              <p className="mt-0.5 truncate text-[12px] italic text-sub">{a.rule}</p>
            </div>

            <div className="flex shrink-0 items-center gap-3 sm:justify-end">
              <Switch checked={a.enabled} onChange={() => onToggle(a.id)} label="Active" />
              <button
                onClick={() => onRemove(a.id)}
                aria-label={`Delete ${a.name}`}
                className="grid h-8 w-8 place-items-center rounded-full text-sub hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-sub">
        Automations run automatically once created — for this demo, executions aren&apos;t
        simulated live.
      </p>
    </section>
  );
}
