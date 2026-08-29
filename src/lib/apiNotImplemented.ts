import { NextResponse } from "next/server";

/** Every Phase B route (src/lib/dataStore.ts) is a stub until a live
 *  Supabase project exists (see the plan: Phase B step 2, "needs you
 *  directly") — this keeps every stub's response identical rather than
 *  each route inventing its own placeholder shape. Swap the real
 *  implementation in per route as Phase B lands; delete this once none of
 *  them need it anymore. */
export function notImplemented(route: string) {
  return NextResponse.json(
    { error: "not_implemented", route, message: `${route} is scaffolded but not wired to a backend yet.` },
    { status: 501 },
  );
}
