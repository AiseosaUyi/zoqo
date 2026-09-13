"use client";
import { ListChecks } from "lucide-react";
import { Card, EmptyState, Tag } from "@/components/ui";
import { usd, pct, ageShort } from "@/lib/format";
import { useTicker } from "@/lib/useTicker";
import type { AlphaDecisionDto } from "./types";

/** Recent accepted/rejected decisions — every intent risk.ts's gate ever
 *  saw, whichever way it went (docs/alpha/03-architecture.md §5's "log
 *  every rejection, unconditionally"). `reject_reason` is only set on a
 *  rejected row; `rationale` (the strategy's own explanation) is always
 *  present regardless of outcome. */
export function DecisionsFeed({ decisions }: { decisions: AlphaDecisionDto[] }) {
  // useTicker (not Date.now() inline) — a direct Date.now() call during
  // render is impure and flagged by the React Compiler lint rule; see
  // src/lib/useDepositCooldown.ts for the same pattern elsewhere.
  const now = useTicker(30_000);
  return (
    <section>
      <h2 className="text-[17px] font-bold text-ink">Decisions</h2>
      <div className="mt-3 flex flex-col gap-2">
        {decisions.length === 0 && (
          <EmptyState icon={ListChecks} title="No decisions yet" description="Run a strategy to see accepted and rejected intents show up here." />
        )}
        {decisions.map((d) => (
          <Card key={d.id} padding="md" className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Tag color={d.status === "accepted" ? "up" : "down"} size="sm">
                  {d.status}
                </Tag>
                <span className="text-[13px] font-semibold text-ink">
                  {d.side} {d.market_id}
                </span>
                <span className="text-[11px] text-sub">{d.venue}</span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-sub">{d.reject_reason ?? d.rationale}</p>
            </div>
            <div className="shrink-0 text-right">
              {d.edge != null && <div className="text-[12px] font-semibold text-ink nums">{pct(d.edge * 100)} edge</div>}
              {d.stake != null && <div className="mt-0.5 text-[11px] text-sub nums">{usd(d.stake)} stake</div>}
              <div className="mt-0.5 text-[10.5px] text-sub">
                {now > 0 ? `${ageShort(now - new Date(d.decided_at).getTime())} ago` : "—"}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
