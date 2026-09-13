import { describe, expect, it } from "vitest";
import { computeOpenPosition, computeClosePosition, MAX_POSITION_PCT } from "../orderExecution";
import type { TerminalPosition } from "../terminalStore";

describe("computeOpenPosition", () => {
  const base = { cash: 10_000, assetId: "BTC", side: "long" as const, id: "p1", now: 1000 };

  it("opens a position within caps", () => {
    const result = computeOpenPosition({ ...base, qty: 1, price: 500 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cashDelta).toBe(-500);
      expect(result.position).toMatchObject({ id: "p1", assetId: "BTC", side: "long", qty: 1, entryPrice: 500 });
    }
  });

  it("rejects non-positive qty or price", () => {
    expect(computeOpenPosition({ ...base, qty: 0, price: 500 })).toEqual({ ok: false, reason: "invalid qty/price" });
    expect(computeOpenPosition({ ...base, qty: 1, price: 0 })).toEqual({ ok: false, reason: "invalid qty/price" });
    expect(computeOpenPosition({ ...base, qty: -1, price: 500 })).toEqual({ ok: false, reason: "invalid qty/price" });
  });

  it("rejects cost exceeding cash", () => {
    const result = computeOpenPosition({ ...base, qty: 100, price: 500 });
    expect(result).toEqual({ ok: false, reason: "insufficient cash" });
  });

  it("allows a position exactly at the MAX_POSITION_PCT boundary", () => {
    const cost = base.cash * MAX_POSITION_PCT; // exactly 10% of cash
    const result = computeOpenPosition({ ...base, qty: cost / 100, price: 100 });
    expect(result.ok).toBe(true);
  });

  it("rejects a position just over the MAX_POSITION_PCT boundary", () => {
    const cost = base.cash * MAX_POSITION_PCT + 0.01;
    const result = computeOpenPosition({ ...base, qty: cost / 100, price: 100 });
    expect(result).toEqual({ ok: false, reason: "exceeds MAX_POSITION_PCT" });
  });

  it("rejects when stop-loss risk exceeds MAX_RISK_PCT", () => {
    // cost = 9*100 = 900, under the 10% ($1,000) position cap; but risk at
    // stop = |100-40|*9 = 540, over the 5% ($500) risk cap.
    const result = computeOpenPosition({ ...base, qty: 9, price: 100, opts: { stopLoss: 40 } });
    expect(result).toEqual({ ok: false, reason: "exceeds MAX_RISK_PCT" });
  });

  it("allows a stop-loss within MAX_RISK_PCT", () => {
    const result = computeOpenPosition({ ...base, qty: 5, price: 100, opts: { stopLoss: 95 } });
    expect(result.ok).toBe(true);
  });
});

describe("computeClosePosition", () => {
  const longPosition: TerminalPosition = {
    id: "p1",
    assetId: "BTC",
    side: "long",
    qty: 10,
    entryPrice: 100,
    openedAt: 500,
  };
  const shortPosition: TerminalPosition = { ...longPosition, id: "p2", side: "short" };

  it("computes positive pnl for a long position closed above entry", () => {
    const result = computeClosePosition({ position: longPosition, price: 120, id: "h1", now: 1000 });
    expect(result.historyEntry.pnl).toBe(200); // (120-100)*10
    expect(result.cashDelta).toBe(100 * 10 + 200); // margin back + pnl
    expect(result.remainingPosition).toBeNull();
  });

  it("computes negative pnl for a long position closed below entry", () => {
    const result = computeClosePosition({ position: longPosition, price: 90, id: "h1", now: 1000 });
    expect(result.historyEntry.pnl).toBe(-100);
  });

  it("computes positive pnl for a short position closed below entry", () => {
    const result = computeClosePosition({ position: shortPosition, price: 80, id: "h2", now: 1000 });
    expect(result.historyEntry.pnl).toBe(200); // (100-80)*10
  });

  it("computes negative pnl for a short position closed above entry", () => {
    const result = computeClosePosition({ position: shortPosition, price: 110, id: "h2", now: 1000 });
    expect(result.historyEntry.pnl).toBe(-100);
  });

  it("partially closes and leaves a reduced remainder", () => {
    const result = computeClosePosition({ position: longPosition, price: 120, qty: 4, id: "h1", now: 1000 });
    expect(result.historyEntry.qty).toBe(4);
    expect(result.remainingPosition).toMatchObject({ qty: 6 });
  });

  it("clamps a close qty larger than the held position to the full position", () => {
    const result = computeClosePosition({ position: longPosition, price: 120, qty: 999, id: "h1", now: 1000 });
    expect(result.historyEntry.qty).toBe(10);
    expect(result.remainingPosition).toBeNull();
  });
});
