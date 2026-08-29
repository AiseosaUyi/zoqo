// Unifies the two closed-trade histories that share ZOQO's one wallet — the
// BTC prediction market (HistoryEntry) and the multi-asset Terminal
// (TerminalHistoryEntry) — into a single chronological journal. Nothing here
// is fabricated; it's a pure merge/sort of the two real localStorage-backed
// histories.
import type { HistoryEntry } from "./types";
import type { TerminalHistoryEntry } from "./terminalStore";
import { ASSET_BY_ID } from "./assets";

export type JournalSource = "predict" | "terminal";

export interface JournalEntry {
  id: string;
  source: JournalSource;
  title: string;
  sideLabel: string;
  sideColor: "up" | "down";
  sizeLabel: string;
  won: boolean; // pnl >= 0 — used for aggregate win rate
  pnl: number;
  closedAt: number;
}

function fromPrediction(e: HistoryEntry): JournalEntry {
  return {
    id: `predict-${e.id}`,
    source: "predict",
    title: `BTC ≥ ${e.strike.toLocaleString()} @ ${e.label}`,
    sideLabel: e.side === "up" ? "Up" : "Down",
    sideColor: e.side,
    sizeLabel: `${e.shares.toLocaleString()} Shares`,
    won: e.pnl >= 0,
    pnl: e.pnl,
    closedAt: e.closedAt,
  };
}

/** Trims a qty like 0.0006458316218795354 down to a readable 0.000646 —
 *  terminal positions are sized in fractional underlying units, so a fixed
 *  small decimals count (unlike the asset's own price `decimals`) would
 *  round micro-positions to 0. */
function formatQty(qty: number): string {
  const fixed = Math.abs(qty) >= 1 ? qty.toFixed(4) : qty.toPrecision(3);
  return fixed.replace(/\.?0+$/, "").replace(/^(-?\d+)\.$/, "$1");
}

function fromTerminal(e: TerminalHistoryEntry): JournalEntry {
  const asset = ASSET_BY_ID[e.assetId];
  return {
    id: `terminal-${e.id}`,
    source: "terminal",
    title: asset?.symbol ?? e.assetId,
    sideLabel: e.side === "long" ? "Long" : "Short",
    sideColor: e.side === "long" ? "up" : "down",
    sizeLabel: `${formatQty(e.qty)} ${asset?.symbol.split("/")[0] ?? ""}`,
    won: e.pnl >= 0,
    pnl: e.pnl,
    closedAt: e.closedAt,
  };
}

/** Merge both closed-trade histories into one list, newest first. */
export function mergeJournal(
  predictHistory: HistoryEntry[],
  terminalHistory: TerminalHistoryEntry[],
): JournalEntry[] {
  const merged = [...predictHistory.map(fromPrediction), ...terminalHistory.map(fromTerminal)];
  return merged.sort((a, b) => b.closedAt - a.closedAt);
}

export interface JournalTotals {
  pnl: number;
  trades: number;
  winRate: number; // 0..1
}

export function journalTotals(entries: JournalEntry[]): JournalTotals {
  if (entries.length === 0) return { pnl: 0, trades: 0, winRate: 0 };
  const pnl = entries.reduce((s, e) => s + e.pnl, 0);
  const wins = entries.reduce((s, e) => s + (e.won ? 1 : 0), 0);
  return { pnl, trades: entries.length, winRate: wins / entries.length };
}
