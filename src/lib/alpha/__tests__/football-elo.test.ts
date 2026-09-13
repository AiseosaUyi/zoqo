import { describe, expect, it } from "vitest";
import { expectedScore, updateElo, eloTo1X2, goalDifferenceMultiplier, DEFAULT_K, DEFAULT_HOME_ADVANTAGE } from "../football/elo";

describe("expectedScore", () => {
  it("is 0.5 for equal ratings", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 9);
  });

  it("favors the higher-rated side", () => {
    expect(expectedScore(1600, 1400)).toBeCloseTo(1 / (1 + 10 ** (-200 / 400)), 9);
    expect(expectedScore(1600, 1400)).toBeGreaterThan(0.5);
  });

  it("is symmetric: expectedScore(a,b) + expectedScore(b,a) = 1", () => {
    expect(expectedScore(1550, 1480) + expectedScore(1480, 1550)).toBeCloseTo(1, 9);
  });
});

describe("goalDifferenceMultiplier", () => {
  it("is exactly 1 for a draw", () => {
    expect(goalDifferenceMultiplier(0, 0)).toBe(1);
  });

  it("is greater than 1 for a decisive scoreline (rewards blowouts)", () => {
    expect(goalDifferenceMultiplier(3, 100)).toBeGreaterThan(1);
  });

  it("increases with a bigger goal difference, all else equal", () => {
    const small = goalDifferenceMultiplier(1, 50);
    const big = goalDifferenceMultiplier(4, 50);
    expect(big).toBeGreaterThan(small);
  });
});

describe("updateElo", () => {
  it("is exactly zero-sum: home gain equals away loss", () => {
    const { newHomeElo, newAwayElo } = updateElo({ homeElo: 1500, awayElo: 1500, homeGoals: 2, awayGoals: 0 });
    const homeDelta = newHomeElo - 1500;
    const awayDelta = newAwayElo - 1500;
    expect(homeDelta).toBeCloseTo(-awayDelta, 9);
  });

  it("raises the winner's rating and lowers the loser's", () => {
    const { newHomeElo, newAwayElo } = updateElo({ homeElo: 1500, awayElo: 1500, homeGoals: 2, awayGoals: 0 });
    expect(newHomeElo).toBeGreaterThan(1500);
    expect(newAwayElo).toBeLessThan(1500);
  });

  it("moves ratings less when the expected favorite wins as expected", () => {
    // Home team already a big favorite (1800 vs 1300) winning 1-0 should
    // move ratings by less than an evenly-matched 1500-vs-1500 1-0 result,
    // since the favorite's win was already highly expected.
    const favoriteWinsAsExpected = updateElo({ homeElo: 1800, awayElo: 1300, homeGoals: 1, awayGoals: 0 });
    const evenMatchUpset = updateElo({ homeElo: 1500, awayElo: 1500, homeGoals: 1, awayGoals: 0 });
    const favoriteDelta = favoriteWinsAsExpected.newHomeElo - 1800;
    const evenDelta = evenMatchUpset.newHomeElo - 1500;
    expect(favoriteDelta).toBeLessThan(evenDelta);
  });

  it("applies a bigger swing for a blowout than a narrow win, all else equal", () => {
    const narrow = updateElo({ homeElo: 1500, awayElo: 1500, homeGoals: 1, awayGoals: 0 });
    const blowout = updateElo({ homeElo: 1500, awayElo: 1500, homeGoals: 5, awayGoals: 0 });
    expect(blowout.newHomeElo - 1500).toBeGreaterThan(narrow.newHomeElo - 1500);
  });

  it("respects custom k and homeAdvantage parameters", () => {
    const defaultResult = updateElo({ homeElo: 1500, awayElo: 1500, homeGoals: 1, awayGoals: 0 });
    const doubledK = updateElo({ homeElo: 1500, awayElo: 1500, homeGoals: 1, awayGoals: 0, k: DEFAULT_K * 2 });
    expect(doubledK.newHomeElo - 1500).toBeCloseTo((defaultResult.newHomeElo - 1500) * 2, 6);
  });

  it("draw still moves ratings toward the underdog when the underdog draws", () => {
    const { newHomeElo, newAwayElo } = updateElo({ homeElo: 1700, awayElo: 1300, homeGoals: 1, awayGoals: 1 });
    // The home favorite (even before home advantage) drawing with a much
    // weaker away side should cost the home team rating and gain the away team some.
    expect(newHomeElo).toBeLessThan(1700);
    expect(newAwayElo).toBeGreaterThan(1300);
  });

  it("uses DEFAULT_HOME_ADVANTAGE by default (a 1500-vs-1500 draw still favors the away team's expectation gap)", () => {
    const { newHomeElo, newAwayElo } = updateElo({ homeElo: 1500, awayElo: 1500, homeGoals: 1, awayGoals: 1 });
    // With home advantage, the home side was expected to score more than
    // 0.5; a draw is therefore a slight underperformance for home and a
    // slight overperformance for away.
    expect(newHomeElo).toBeLessThan(1500);
    expect(newAwayElo).toBeGreaterThan(1500);
    expect(DEFAULT_HOME_ADVANTAGE).toBeGreaterThan(0);
  });
});

describe("eloTo1X2", () => {
  it("sums to 1", () => {
    const { home, draw, away } = eloTo1X2(120);
    expect(home + draw + away).toBeCloseTo(1, 9);
  });

  it("splits home/away evenly and peaks the draw probability at eloDiff=0", () => {
    const { home, draw, away } = eloTo1X2(0, 0.28);
    expect(home).toBeCloseTo(away, 9);
    expect(draw).toBeCloseTo(0.28, 9);
  });

  it("shrinks the draw probability as the gap widens", () => {
    const closeMatch = eloTo1X2(20);
    const lopsided = eloTo1X2(500);
    expect(lopsided.draw).toBeLessThan(closeMatch.draw);
  });

  it("gives the higher-rated side a higher win probability", () => {
    const { home, away } = eloTo1X2(300);
    expect(home).toBeGreaterThan(away);
  });

  it("is symmetric under negation of eloDiff", () => {
    const positive = eloTo1X2(250);
    const negative = eloTo1X2(-250);
    expect(positive.home).toBeCloseTo(negative.away, 9);
    expect(positive.away).toBeCloseTo(negative.home, 9);
    expect(positive.draw).toBeCloseTo(negative.draw, 9);
  });

  it("keeps every probability within [0, 1]", () => {
    for (const diff of [-1000, -300, 0, 300, 1000]) {
      const { home, draw, away } = eloTo1X2(diff);
      for (const p of [home, draw, away]) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});
