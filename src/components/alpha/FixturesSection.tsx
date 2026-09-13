"use client";
import * as React from "react";
import { Trophy, Ticket } from "lucide-react";
import { Button, Card, EmptyState, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AlphaFixtureDto, AlphaSlipSelection, AlphaSlipResultDto } from "./types";

/** `/alpha`'s fixtures tab (docs/alpha/03-architecture.md §9's "fixtures
 *  view with model vs market probabilities and the slip builder"): each
 *  fixture's blend-model probability per 1X2 outcome, edge-highlighted in
 *  green when the model favors a real edge over the book
 *  (`MIN_EDGE_HIGHLIGHT`, matching the strategies' own default `min_edge`),
 *  and a lightweight slip builder — click an outcome to add/replace it in
 *  the slip, then "Build slip" posts to `/api/alpha/slip`
 *  (`src/lib/alpha/slip.ts`, same function the `build_slip` MCP tool
 *  calls). One outcome per fixture at a time (clicking a second outcome on
 *  the same fixture replaces the first) — betting both sides of the same
 *  match isn't a real slip. */

const MIN_EDGE_HIGHLIGHT = 0.02;

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function OutcomeButton({
  label,
  modelProb,
  edge,
  selected,
  onClick,
}: {
  label: string;
  modelProb: number | undefined;
  edge: number | null;
  selected: boolean;
  onClick: () => void;
}) {
  const highlighted = edge != null && edge >= MIN_EDGE_HIGHLIGHT;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 rounded-[8px] border px-2 py-1.5 text-center transition-colors",
        selected ? "border-purple-500 bg-purple-50" : highlighted ? "border-green-300 bg-green-50" : "border-gray-200 bg-white hover:bg-gray-50",
      )}
    >
      <span className="text-[10px] font-semibold uppercase text-sub">{label}</span>
      <span className="text-[13px] font-bold text-ink nums">{modelProb != null ? fmtPct(modelProb) : "—"}</span>
      {edge != null && (
        <span className={cn("text-[10px] nums", highlighted ? "text-green-600" : "text-sub")}>
          {edge >= 0 ? "+" : ""}
          {(edge * 100).toFixed(1)}pt
        </span>
      )}
    </button>
  );
}

export function FixturesSection({
  fixtures,
  onBuildSlip,
  slipResult,
  slipLoading,
}: {
  fixtures: AlphaFixtureDto[];
  onBuildSlip: (selections: AlphaSlipSelection[]) => void;
  slipResult: AlphaSlipResultDto | null;
  slipLoading: boolean;
}) {
  const [selections, setSelections] = React.useState<AlphaSlipSelection[]>([]);

  function toggle(fixtureId: string, outcome: AlphaSlipSelection["outcome"]) {
    setSelections((prev) => {
      const exists = prev.some((s) => s.fixtureId === fixtureId && s.outcome === outcome);
      const withoutFixture = prev.filter((s) => s.fixtureId !== fixtureId);
      return exists ? withoutFixture : [...withoutFixture, { fixtureId, market: "1x2" as const, outcome }];
    });
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold text-ink">Fixtures</h2>
        {selections.length > 0 && (
          <Button size="sm" color="brand" onClick={() => onBuildSlip(selections)} disabled={slipLoading}>
            <Ticket size={13} className="mr-1" /> Build slip ({selections.length})
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {fixtures.length === 0 && (
          <EmptyState
            icon={Trophy}
            title="No upcoming fixtures"
            description="Fixtures land here once an ingest pass populates alpha_fixtures — see docs/alpha/STATUS.md for the pending API-key setup."
          />
        )}
        {fixtures.map((f) => {
          const prediction = f.prediction;
          const edge = f.edgeByOutcome;
          return (
            <Card key={f.id} padding="md">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">
                      {f.home_team} vs {f.away_team}
                    </span>
                    <Tag color="gray" size="sm">
                      {f.league_id}
                    </Tag>
                  </div>
                  <p className="mt-0.5 text-[11px] text-sub">
                    {new Date(f.kickoff_at).toLocaleString()} · {f.booksUsed} book{f.booksUsed === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {prediction ? (
                <div className="mt-3 flex gap-2">
                  <OutcomeButton
                    label="Home"
                    modelProb={prediction.home}
                    edge={edge?.home ?? null}
                    selected={selections.some((s) => s.fixtureId === f.id && s.outcome === "home")}
                    onClick={() => toggle(f.id, "home")}
                  />
                  <OutcomeButton
                    label="Draw"
                    modelProb={prediction.draw}
                    edge={edge?.draw ?? null}
                    selected={selections.some((s) => s.fixtureId === f.id && s.outcome === "draw")}
                    onClick={() => toggle(f.id, "draw")}
                  />
                  <OutcomeButton
                    label="Away"
                    modelProb={prediction.away}
                    edge={edge?.away ?? null}
                    selected={selections.some((s) => s.fixtureId === f.id && s.outcome === "away")}
                    onClick={() => toggle(f.id, "away")}
                  />
                </div>
              ) : (
                <p className="mt-2 text-[11.5px] text-sub">No model prediction yet — needs odds snapshots or team ratings.</p>
              )}
            </Card>
          );
        })}
      </div>

      {slipResult && (
        <Card padding="md" className="mt-3">
          {slipResult.error ? (
            <p className="text-[12.5px] text-red-600">{slipResult.error}</p>
          ) : (
            <>
              <pre className="whitespace-pre-wrap font-[inherit] text-[12px] text-ink">{slipResult.plainText}</pre>
              {slipResult.placed && (
                <p className="mt-2 text-[11.5px] text-sub">
                  Placed on zoqo-sportsbook: <span className="font-semibold text-ink">{slipResult.placed.status}</span>
                </p>
              )}
            </>
          )}
        </Card>
      )}
    </section>
  );
}
