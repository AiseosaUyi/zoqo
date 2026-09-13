import { describe, expect, it } from "vitest";
import {
  timeDecayWeight,
  tau,
  poissonGrid,
  gridTo1X2,
  gridToOverUnder,
  gridToBtts,
  fitDixonColes,
  expectedGoals,
  type HistoricalMatch,
} from "../football/dixonColes";

describe("timeDecayWeight", () => {
  it("is 1 for a match today", () => {
    expect(timeDecayWeight(0)).toBe(1);
  });

  it("decays toward 0 with age", () => {
    expect(timeDecayWeight(1000, 0.001)).toBeLessThan(timeDecayWeight(100, 0.001));
    expect(timeDecayWeight(1000, 0.001)).toBeGreaterThan(0);
  });

  it("halves at daysAgo = ln(2)/xi", () => {
    const xi = 0.001;
    expect(timeDecayWeight(Math.log(2) / xi, xi)).toBeCloseTo(0.5, 6);
  });
});

describe("tau (Dixon-Coles low-score correction)", () => {
  const lambda = 1.4;
  const mu = 1.1;
  const rho = -0.1;

  it("matches the published formula for each of the 4 corrected cells", () => {
    expect(tau(0, 0, lambda, mu, rho)).toBeCloseTo(1 - lambda * mu * rho, 9);
    expect(tau(0, 1, lambda, mu, rho)).toBeCloseTo(1 + lambda * rho, 9);
    expect(tau(1, 0, lambda, mu, rho)).toBeCloseTo(1 + mu * rho, 9);
    expect(tau(1, 1, lambda, mu, rho)).toBeCloseTo(1 - rho, 9);
  });

  it("is exactly 1 outside the 4 corrected cells", () => {
    expect(tau(2, 0, lambda, mu, rho)).toBe(1);
    expect(tau(0, 2, lambda, mu, rho)).toBe(1);
    expect(tau(3, 3, lambda, mu, rho)).toBe(1);
  });

  it("degenerates to independent Poisson (tau=1 everywhere relevant) when rho=0", () => {
    expect(tau(0, 0, lambda, mu, 0)).toBe(1);
    expect(tau(1, 1, lambda, mu, 0)).toBe(1);
  });
});

describe("poissonGrid", () => {
  it("sums to 1", () => {
    const grid = poissonGrid(1.4, 1.1, -0.1);
    const total = grid.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("is (maxGoals+1) x (maxGoals+1)", () => {
    const grid = poissonGrid(1.4, 1.1, -0.1, 6);
    expect(grid.length).toBe(7);
    expect(grid[0].length).toBe(7);
  });

  it("puts more mass on low scorelines for low expected goals", () => {
    const grid = poissonGrid(0.5, 0.5, 0);
    expect(grid[0][0]).toBeGreaterThan(grid[5][5]);
  });
});

describe("grid summary functions", () => {
  const grid = poissonGrid(1.6, 1.1, -0.08);

  it("gridTo1X2 sums to ~1 and favors the higher-expected side", () => {
    const { home, draw, away } = gridTo1X2(grid);
    expect(home + draw + away).toBeCloseTo(1, 6);
    expect(home).toBeGreaterThan(away);
  });

  it("gridToOverUnder sums to ~1", () => {
    const { over, under } = gridToOverUnder(grid, 2.5);
    expect(over + under).toBeCloseTo(1, 6);
  });

  it("gridToBtts sums to ~1", () => {
    const { yes, no } = gridToBtts(grid);
    expect(yes + no).toBeCloseTo(1, 6);
  });
});

describe("fitDixonColes", () => {
  it("returns empty maps for no matches", () => {
    const fit = fitDixonColes([]);
    expect(fit.attack).toEqual({});
    expect(fit.defence).toEqual({});
  });

  it("fits a dominant team a higher attack and lower (better) defence than a weak one", () => {
    const matches: HistoricalMatch[] = [];
    // TeamA dominates TeamB 3-0 regardless of venue, over many matches, all
    // recent (daysAgo=0, full weight) so the fit isn't muddied by decay.
    for (let i = 0; i < 12; i++) {
      matches.push({ homeTeamId: "TeamA", awayTeamId: "TeamB", homeGoals: 3, awayGoals: 0, daysAgo: 0 });
      matches.push({ homeTeamId: "TeamB", awayTeamId: "TeamA", homeGoals: 0, awayGoals: 3, daysAgo: 0 });
    }
    const fit = fitDixonColes(matches);
    expect(fit.attack.TeamA).toBeGreaterThan(fit.attack.TeamB);
    expect(fit.defence.TeamA).toBeLessThan(fit.defence.TeamB);
    expect(Number.isFinite(fit.homeAdvantage)).toBe(true);
    expect(fit.rho).toBeGreaterThanOrEqual(-0.3);
    expect(fit.rho).toBeLessThanOrEqual(0.3);
  });

  it("produces expected goals consistent with the fitted strengths (TeamA scores far more against TeamB than vice versa)", () => {
    const matches: HistoricalMatch[] = [];
    for (let i = 0; i < 12; i++) {
      matches.push({ homeTeamId: "TeamA", awayTeamId: "TeamB", homeGoals: 3, awayGoals: 0, daysAgo: 0 });
      matches.push({ homeTeamId: "TeamB", awayTeamId: "TeamA", homeGoals: 0, awayGoals: 3, daysAgo: 0 });
    }
    const fit = fitDixonColes(matches);
    const { homeExpected, awayExpected } = expectedGoals(fit, "TeamA", "TeamB");
    expect(homeExpected).toBeGreaterThan(awayExpected);
  });

  it("treats an unseen team as league-average (attack=defence=0) rather than throwing", () => {
    const matches: HistoricalMatch[] = [
      { homeTeamId: "TeamA", awayTeamId: "TeamB", homeGoals: 1, awayGoals: 1, daysAgo: 10 },
    ];
    const fit = fitDixonColes(matches);
    const { homeExpected, awayExpected } = expectedGoals(fit, "TeamA", "UnknownTeam");
    expect(Number.isFinite(homeExpected)).toBe(true);
    expect(Number.isFinite(awayExpected)).toBe(true);
  });

  it("gives older matches less influence than recent ones via the decay weight", () => {
    // TeamA beat TeamB long ago; recently TeamB has been beating TeamA.
    // A fit with a real decay (small xi so it still matters within these
    // day ranges) should reflect the recent form more than the old form.
    const matches: HistoricalMatch[] = [];
    for (let i = 0; i < 10; i++) {
      matches.push({ homeTeamId: "TeamA", awayTeamId: "TeamB", homeGoals: 3, awayGoals: 0, daysAgo: 2000 });
    }
    for (let i = 0; i < 10; i++) {
      matches.push({ homeTeamId: "TeamB", awayTeamId: "TeamA", homeGoals: 3, awayGoals: 0, daysAgo: 1 });
    }
    const decayedFit = fitDixonColes(matches, 0.01);
    // With strong decay, recent TeamB dominance should outweigh TeamA's
    // ancient dominance: TeamB ends up rated stronger on attack.
    expect(decayedFit.attack.TeamB).toBeGreaterThan(decayedFit.attack.TeamA);
  });
});
