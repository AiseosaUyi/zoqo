import { describe, expect, it } from "vitest";
import { parseMarketId, encodeMarketId, resolveOutcome } from "../zoqoSportsbook";

describe("parseMarketId / encodeMarketId", () => {
  it("round-trips a well-formed triple", () => {
    const id = encodeMarketId("12345", "1x2", "home");
    expect(id).toBe("12345:1x2:home");
    expect(parseMarketId(id)).toEqual({ fixtureId: "12345", market: "1x2", outcome: "home" });
  });

  it("rejects malformed strings instead of throwing", () => {
    expect(parseMarketId("not-a-triple")).toBeNull();
    expect(parseMarketId("12345:1x2")).toBeNull();
    expect(parseMarketId("12345:1x2:home:extra")).toBeNull();
  });

  it("rejects an unknown market or outcome", () => {
    expect(parseMarketId("12345:parlay:home")).toBeNull();
    expect(parseMarketId("12345:1x2:maybe")).toBeNull();
  });

  it("rejects an outcome that doesn't belong to its market", () => {
    expect(parseMarketId("12345:1x2:over")).toBeNull(); // "over" belongs to ou25, not 1x2
    expect(parseMarketId("12345:ou25:home")).toBeNull();
  });
});

describe("resolveOutcome", () => {
  it("settles 1x2", () => {
    expect(resolveOutcome("1x2", "home", 2, 1)).toBe(true);
    expect(resolveOutcome("1x2", "away", 2, 1)).toBe(false);
    expect(resolveOutcome("1x2", "draw", 1, 1)).toBe(true);
  });

  it("settles over/under 2.5", () => {
    expect(resolveOutcome("ou25", "over", 2, 1)).toBe(true); // 3 total > 2.5
    expect(resolveOutcome("ou25", "under", 2, 1)).toBe(false);
    expect(resolveOutcome("ou25", "under", 1, 1)).toBe(true); // 2 total < 2.5
    expect(resolveOutcome("ou25", "over", 1, 1)).toBe(false);
  });

  it("settles both teams to score", () => {
    expect(resolveOutcome("btts", "yes", 1, 1)).toBe(true);
    expect(resolveOutcome("btts", "no", 1, 1)).toBe(false);
    expect(resolveOutcome("btts", "no", 2, 0)).toBe(true);
    expect(resolveOutcome("btts", "yes", 2, 0)).toBe(false);
  });

  it("settles double chance", () => {
    // Home win: hd and ha win, da loses.
    expect(resolveOutcome("dc", "hd", 2, 1)).toBe(true);
    expect(resolveOutcome("dc", "ha", 2, 1)).toBe(true);
    expect(resolveOutcome("dc", "da", 2, 1)).toBe(false);
    // Draw: hd and da win, ha loses.
    expect(resolveOutcome("dc", "hd", 1, 1)).toBe(true);
    expect(resolveOutcome("dc", "da", 1, 1)).toBe(true);
    expect(resolveOutcome("dc", "ha", 1, 1)).toBe(false);
    // Away win: da and ha win, hd loses.
    expect(resolveOutcome("dc", "da", 0, 1)).toBe(true);
    expect(resolveOutcome("dc", "ha", 0, 1)).toBe(true);
    expect(resolveOutcome("dc", "hd", 0, 1)).toBe(false);
  });
});
