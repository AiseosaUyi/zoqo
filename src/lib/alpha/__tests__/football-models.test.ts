import { describe, expect, it } from "vitest";
import { marketModel, dixonColesModel, eloModel, blendModel, DEFAULT_BLEND_WEIGHT } from "../football/models";
import { multiplicativeNormalize, shinProbabilities } from "../football/margin";
import { eloTo1X2 } from "../football/elo";
import type { DixonColesFit } from "../football/dixonColes";

describe("marketModel", () => {
  it("matches multiplicativeNormalize for a single book", () => {
    const odds = { home: 2.1, draw: 3.4, away: 3.6 };
    const pred = marketModel([odds]);
    const [home, draw, away] = multiplicativeNormalize([odds.home, odds.draw, odds.away]);
    expect(pred.home).toBeCloseTo(home, 9);
    expect(pred.draw).toBeCloseTo(draw, 9);
    expect(pred.away).toBeCloseTo(away, 9);
  });

  it("averages margin-removed probabilities across multiple books", () => {
    const bookA = { home: 2.0, draw: 3.5, away: 4.0 };
    const bookB = { home: 2.2, draw: 3.3, away: 3.6 };
    const pred = marketModel([bookA, bookB]);
    const [aH, aD, aA] = multiplicativeNormalize([bookA.home, bookA.draw, bookA.away]);
    const [bH, bD, bA] = multiplicativeNormalize([bookB.home, bookB.draw, bookB.away]);
    expect(pred.home).toBeCloseTo((aH + bH) / 2, 9);
    expect(pred.draw).toBeCloseTo((aD + bD) / 2, 9);
    expect(pred.away).toBeCloseTo((aA + bA) / 2, 9);
  });

  it("uses shin's method when requested", () => {
    const odds = { home: 1.2, draw: 6.5, away: 12 };
    const pred = marketModel([odds], "shin");
    const [home, draw, away] = shinProbabilities([odds.home, odds.draw, odds.away]);
    expect(pred.home).toBeCloseTo(home, 9);
    expect(pred.draw).toBeCloseTo(draw, 9);
    expect(pred.away).toBeCloseTo(away, 9);
  });

  it("throws with no books", () => {
    expect(() => marketModel([])).toThrow();
  });
});

describe("dixonColesModel", () => {
  const fit: DixonColesFit = {
    attack: { Home: 0.3, Away: -0.1 },
    defence: { Home: -0.2, Away: 0.1 },
    homeAdvantage: 0.25,
    rho: -0.05,
  };

  it("returns a full 1X2 + over25 + btts prediction that sums sanely", () => {
    const pred = dixonColesModel(fit, "Home", "Away");
    expect(pred.home + pred.draw + pred.away).toBeCloseTo(1, 6);
    expect(pred.over25).toBeGreaterThan(0);
    expect(pred.over25).toBeLessThan(1);
    expect(pred.btts).toBeGreaterThan(0);
    expect(pred.btts).toBeLessThan(1);
  });

  it("favors the team with the stronger fitted attack/defence", () => {
    const pred = dixonColesModel(fit, "Home", "Away");
    expect(pred.home).toBeGreaterThan(pred.away);
  });

  it("respects a custom over/under line", () => {
    const predLow = dixonColesModel(fit, "Home", "Away", 0.5);
    const predHigh = dixonColesModel(fit, "Home", "Away", 5.5);
    expect(predLow.over25!).toBeGreaterThan(predHigh.over25!);
  });
});

describe("eloModel", () => {
  it("delegates directly to eloTo1X2", () => {
    expect(eloModel(150)).toEqual(eloTo1X2(150));
    expect(eloModel(150, 0.3)).toEqual(eloTo1X2(150, 0.3));
  });
});

describe("blendModel", () => {
  const market = { home: 0.5, draw: 0.25, away: 0.25 };
  const dixonColes = { home: 0.4, draw: 0.3, away: 0.3, over25: 0.55, btts: 0.52 };

  it("returns exactly the market prediction at w=1", () => {
    const blended = blendModel(market, dixonColes, 1);
    expect(blended.home).toBeCloseTo(market.home, 9);
    expect(blended.draw).toBeCloseTo(market.draw, 9);
    expect(blended.away).toBeCloseTo(market.away, 9);
  });

  it("returns exactly the dixon-coles 1X2 at w=0", () => {
    const blended = blendModel(market, dixonColes, 0);
    expect(blended.home).toBeCloseTo(dixonColes.home, 9);
    expect(blended.draw).toBeCloseTo(dixonColes.draw, 9);
    expect(blended.away).toBeCloseTo(dixonColes.away, 9);
  });

  it("passes through dixon-coles' over25/btts regardless of w", () => {
    const blended = blendModel(market, dixonColes, 1);
    expect(blended.over25).toBe(dixonColes.over25);
    expect(blended.btts).toBe(dixonColes.btts);
  });

  it("uses DEFAULT_BLEND_WEIGHT (0.75) by default", () => {
    const blended = blendModel(market, dixonColes);
    expect(blended.home).toBeCloseTo(DEFAULT_BLEND_WEIGHT * market.home + (1 - DEFAULT_BLEND_WEIGHT) * dixonColes.home, 9);
  });

  it("sums to 1 for any w in [0,1]", () => {
    for (const w of [0, 0.25, 0.5, 0.75, 1]) {
      const blended = blendModel(market, dixonColes, w);
      expect(blended.home + blended.draw + blended.away).toBeCloseTo(1, 9);
    }
  });
});
