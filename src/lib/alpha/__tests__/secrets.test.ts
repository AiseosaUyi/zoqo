import { describe, expect, it, afterEach } from "vitest";
import { getVenueSecret } from "../secrets";

/** Only the env-var-name-derivation branching is worth testing here — the
 *  lookup itself is a one-line `process.env[x]` read. */
describe("getVenueSecret", () => {
  const originalManifold = process.env.MANIFOLD_API_KEY;
  const originalGeneric = process.env.KALSHI_DEMO_API_KEY;

  afterEach(() => {
    if (originalManifold === undefined) delete process.env.MANIFOLD_API_KEY;
    else process.env.MANIFOLD_API_KEY = originalManifold;
    if (originalGeneric === undefined) delete process.env.KALSHI_DEMO_API_KEY;
    else process.env.KALSHI_DEMO_API_KEY = originalGeneric;
  });

  it("reads MANIFOLD_API_KEY for the explicitly-mapped 'manifold' venue", async () => {
    process.env.MANIFOLD_API_KEY = "test-key-123";
    expect(await getVenueSecret("user-1", "manifold")).toBe("test-key-123");
  });

  it("returns null when the mapped env var is unset", async () => {
    delete process.env.MANIFOLD_API_KEY;
    expect(await getVenueSecret("user-1", "manifold")).toBeNull();
  });

  it("derives an env var name for an unmapped venue by uppercasing and replacing dashes", async () => {
    process.env.KALSHI_DEMO_API_KEY = "another-key";
    expect(await getVenueSecret("user-1", "kalshi-demo")).toBe("another-key");
  });

  it("returns null for an unmapped venue with no derived env var set", async () => {
    delete process.env.SOME_UNKNOWN_VENUE_API_KEY;
    expect(await getVenueSecret("user-1", "some-unknown-venue")).toBeNull();
  });
});
