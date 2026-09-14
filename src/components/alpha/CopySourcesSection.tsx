"use client";
import * as React from "react";
import { Users, Check, X, Sparkles } from "lucide-react";
import { Button, Card, EmptyState, Tag, Select, Input } from "@/components/ui";
import { useTicker } from "@/lib/useTicker";
import type { AlphaCopySourceDto } from "./types";

/** `/alpha`'s copy-sources tab (docs/alpha/08-copy-trading.md §9): a source
 *  card per candidate/followed wallet showing n, Brier/CLV, copyability,
 *  and days followed, plus the propose/confirm flow. The gap chart itself
 *  (source CLV vs our CLV over time) is out of this pass's scope — `get_
 *  copy_gap`/`getCopyGap` computes the numbers today; charting them is a
 *  follow-up once real copy volume exists to chart. */

function pct(v: number | null | undefined, digits = 0): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function StatusTag({ status }: { status: AlphaCopySourceDto["status"] }) {
  const color = status === "followed" ? "up" : status === "dropped" || status === "blocked" ? "down" : "gray";
  return (
    <Tag color={color} size="sm">
      {status}
    </Tag>
  );
}

function SourceCard({ source, onSetStatus, now }: { source: AlphaCopySourceDto; onSetStatus: (id: string, status: AlphaCopySourceDto["status"]) => void; now: number }) {
  const m = source.metrics ?? {};
  const daysFollowed = source.followed_since && now > 0 ? Math.floor((now - new Date(source.followed_since).getTime()) / 86_400_000) : null;
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-ink">{source.label ?? source.source_ref}</span>
            <Tag color="gray" size="sm">
              {source.venue}
            </Tag>
            <StatusTag status={source.status} />
            {daysFollowed != null && <span className="text-[11px] text-sub">followed {daysFollowed}d</span>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-sub sm:grid-cols-4">
            <div>
              n: <span className="font-semibold text-ink nums">{m.n ?? 0}</span> ({m.resolvedN ?? 0} resolved)
            </div>
            <div>
              Brier: <span className="font-semibold text-ink nums">{m.brier != null ? m.brier.toFixed(3) : "—"}</span>
            </div>
            <div>
              Profit factor: <span className="font-semibold text-ink nums">{m.profitFactor != null && Number.isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "—"}</span>
            </div>
            <div>
              Copyability: <span className="font-semibold text-ink nums">{pct(m.copyability)}</span>
            </div>
            <div>
              Consistency: <span className="font-semibold text-ink nums">{pct(m.consistency)}</span>
            </div>
            <div>
              Score: <span className="font-semibold text-ink nums">{source.score != null ? source.score.toFixed(3) : "—"}</span>
            </div>
          </div>
        </div>
        {source.status === "candidate" && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="solid" onClick={() => onSetStatus(source.id, "followed")}>
              <Check size={13} className="mr-1" /> Follow
            </Button>
            <Button size="sm" variant="outline" onClick={() => onSetStatus(source.id, "blocked")}>
              <X size={13} className="mr-1" /> Block
            </Button>
          </div>
        )}
        {source.status === "followed" && (
          <Button size="sm" variant="outline" onClick={() => onSetStatus(source.id, "dropped")}>
            Drop
          </Button>
        )}
      </div>
    </Card>
  );
}

export function CopySourcesSection({
  sources,
  onPropose,
  onSetStatus,
  proposing,
}: {
  sources: AlphaCopySourceDto[];
  onPropose: (venue: string, candidateRefs?: string[]) => void;
  onSetStatus: (id: string, status: AlphaCopySourceDto["status"]) => void;
  proposing: boolean;
}) {
  const [venue, setVenue] = React.useState<string>("polymarket-sim");
  const [manualRef, setManualRef] = React.useState("");
  const now = useTicker(60_000);

  return (
    <section>
      <h2 className="text-[17px] font-bold text-ink">Copy trading sources</h2>
      <p className="mt-0.5 text-[12.5px] text-sub">
        Follow verified top traders on Polymarket (real leaderboard) or Manifold (name a username — it has no public leaderboard API). Selecting is a
        proposal; you confirm the first time, then the nightly screen maintains it.
      </p>

      <Card padding="md" className="mt-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[11px] font-semibold text-sub">Venue</label>
            <Select
              value={venue}
              onChange={setVenue}
              data={[
                { value: "polymarket-sim", label: "Polymarket" },
                { value: "manifold", label: "Manifold" },
              ]}
            />
          </div>
          {venue === "manifold" && (
            <div>
              <label className="text-[11px] font-semibold text-sub">Username (required — no public leaderboard)</label>
              <Input value={manualRef} onChange={(e) => setManualRef(e.target.value)} placeholder="e.g. SomeSharpTrader" />
            </div>
          )}
          <Button
            color="brand"
            disabled={proposing || (venue === "manifold" && !manualRef.trim())}
            onClick={() => onPropose(venue, venue === "manifold" ? [manualRef.trim()] : undefined)}
          >
            <Sparkles size={14} className="mr-1" /> {proposing ? "Screening…" : "Propose sources"}
          </Button>
        </div>
      </Card>

      <div className="mt-3 flex flex-col gap-2">
        {sources.length === 0 && (
          <EmptyState
            icon={Users}
            title="No sources yet"
            description="Propose sources above — Polymarket screens its real profit leaderboard automatically; Manifold needs a username since it has no public leaderboard."
          />
        )}
        {sources.map((s) => (
          <SourceCard key={s.id} source={s} onSetStatus={onSetStatus} now={now} />
        ))}
      </div>
    </section>
  );
}
