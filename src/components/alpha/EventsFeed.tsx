"use client";
import { Bell, Check } from "lucide-react";
import { Button, Card, EmptyState, Tag } from "@/components/ui";
import { ageShort } from "@/lib/format";
import { useTicker } from "@/lib/useTicker";
import type { AlphaEventDto } from "./types";

function summarize(kind: string, payload: unknown): string {
  const p = payload as Record<string, unknown> | null;
  switch (kind) {
    case "kill":
      return p?.on ? `Kill switch turned on${p.reason ? ` — ${p.reason}` : ""}` : "Kill switch turned off";
    case "paused":
      return `Strategy paused${p?.reason ? ` — ${p.reason}` : ""}`;
    case "resumed":
      return "Strategy resumed";
    default:
      return kind;
  }
}

/** Recent alpha_events — kill-switch flips, pause/resume, and (from later
 *  phases) risk-gate rejection notices. Acknowledge just marks the row
 *  read; it doesn't undo anything. */
export function EventsFeed({ events, onAck }: { events: AlphaEventDto[]; onAck: (id: string) => void }) {
  const now = useTicker(30_000);
  return (
    <section>
      <h2 className="text-[17px] font-bold text-ink">Events</h2>
      <div className="mt-3 flex flex-col gap-2">
        {events.length === 0 && <EmptyState icon={Bell} title="No events yet" description="Kill-switch flips and pause/resume actions show up here." />}
        {events.map((e) => (
          <Card key={e.id} padding="md" className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Tag color={e.acknowledged ? "gray" : "brand"} size="sm">
                  {e.kind}
                </Tag>
                <span className="text-[10.5px] text-sub">
                  {now > 0 ? `${ageShort(now - new Date(e.created_at).getTime())} ago` : "—"}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-ink">{summarize(e.kind, e.payload)}</p>
            </div>
            {!e.acknowledged && (
              <Button size="sm" variant="outline" onClick={() => onAck(e.id)}>
                <Check size={13} className="mr-1" /> Ack
              </Button>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
