import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";
import type { VenueId } from "@/lib/alpha/core/venue";

export const dynamic = "force-dynamic";

/** Session-scoped CRUD over alpha_venues. GET lists every venue row the
 *  caller has referenced (service.listVenues never auto-provisions — see
 *  service.ts's getOrCreateVenue comment); PATCH edits one venue's
 *  enabled/caps, auto-provisioning that row on first reference. Phase 1
 *  only ever has one real venue (zoqo-terminal), but the shape is the same
 *  one Phase 2+'s external venues will use. */

// Mirrors VenueId (src/lib/alpha/core/venue.ts) — that file only exports a
// type, so this repeats the member list as a runtime array purely for input
// validation here.
const VALID_VENUE_IDS: VenueId[] = [
  "zoqo-terminal",
  "zoqo-predict",
  "zoqo-sportsbook",
  "manifold",
  "kalshi-demo",
  "bybit-demo",
  "deriv-virtual",
  "polymarket-sim",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const venues = await service.listVenues(supabase, user.id);
  return NextResponse.json(venues);
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    venue?: unknown;
    enabled?: unknown;
    maxStake?: unknown;
    dailyCap?: unknown;
    dailyLossStop?: unknown;
  } | null;
  if (!body || typeof body.venue !== "string" || !VALID_VENUE_IDS.includes(body.venue as VenueId)) {
    return NextResponse.json({ error: `venue must be one of ${VALID_VENUE_IDS.join(", ")}` }, { status: 400 });
  }
  for (const key of ["enabled", "maxStake", "dailyCap", "dailyLossStop"] as const) {
    const v = body[key];
    if (v == null) continue;
    if (key === "enabled" && typeof v !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    if (key !== "enabled" && typeof v !== "number") {
      return NextResponse.json({ error: `${key} must be a number` }, { status: 400 });
    }
  }

  await service.setVenue(supabase, user.id, {
    venue: body.venue as VenueId,
    enabled: body.enabled as boolean | undefined,
    maxStake: body.maxStake as number | undefined,
    dailyCap: body.dailyCap as number | undefined,
    dailyLossStop: body.dailyLossStop as number | undefined,
  });
  return NextResponse.json({ ok: true });
}
