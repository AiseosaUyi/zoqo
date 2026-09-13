"use client";
import { FlaskConical, Check, X } from "lucide-react";
import { Button, Card, EmptyState, Tag } from "@/components/ui";
import { ageShort } from "@/lib/format";
import { useTicker } from "@/lib/useTicker";
import type { AlphaProposalDto } from "./types";

/** Unacknowledged parameter-search proposals (docs/alpha/03-architecture.md
 *  §7 Level 4) — `paramSearch.ts` writes these, nothing else. Applying one
 *  merges `proposedParams` onto the strategy's live params and logs an
 *  `applied` event; dismissing just clears it from the inbox. Same visual
 *  shape as `EventsFeed.tsx`/`DecisionsFeed.tsx` (Card list + EmptyState). */

function formatParamValue(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4);
  return String(v);
}

function ParamDiff({ current, proposed }: { current: Record<string, unknown>; proposed: Record<string, unknown> }) {
  const keys = Object.keys(proposed);
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {keys.map((key) => (
        <div key={key} className="text-[11.5px]">
          <span className="text-sub">{key}: </span>
          <span className="text-ink line-through opacity-60">{formatParamValue(current[key])}</span>
          <span className="text-sub"> → </span>
          <span className="font-semibold text-up">{formatParamValue(proposed[key])}</span>
        </div>
      ))}
    </div>
  );
}

export function ProposalsInbox({
  proposals,
  onApply,
  onDismiss,
}: {
  proposals: AlphaProposalDto[];
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const now = useTicker(30_000);
  return (
    <section>
      <h2 className="text-[17px] font-bold text-ink">Proposals</h2>
      <div className="mt-3 flex flex-col gap-2">
        {proposals.length === 0 && (
          <EmptyState
            icon={FlaskConical}
            title="No proposals yet"
            description="Weekly parameter search writes a proposal here when it finds a candidate that clears the improvement threshold on held-out history."
          />
        )}
        {proposals.map((p) => {
          const improvement = p.payload.expectedImprovement;
          return (
            <Card key={p.id} padding="md" className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag color="brand" size="sm">
                    proposal
                  </Tag>
                  {improvement != null && (
                    <span className="text-[12px] font-semibold text-up nums">+{(improvement * 100).toFixed(1)}% expected</span>
                  )}
                  <span className="text-[10.5px] text-sub">{now > 0 ? `${ageShort(now - new Date(p.created_at).getTime())} ago` : "—"}</span>
                </div>
                {p.payload.currentParams && p.payload.proposedParams && (
                  <ParamDiff current={p.payload.currentParams} proposed={p.payload.proposedParams} />
                )}
                {p.payload.note && <p className="mt-2 text-[11px] leading-relaxed text-sub">{p.payload.note}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="solid" onClick={() => onApply(p.id)}>
                  <Check size={13} className="mr-1" /> Apply
                </Button>
                <Button size="sm" variant="outline" onClick={() => onDismiss(p.id)}>
                  <X size={13} className="mr-1" /> Dismiss
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
