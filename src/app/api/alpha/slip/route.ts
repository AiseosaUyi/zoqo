import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { buildSlip, type BuildSlipInput, type SlipSelectionInput } from "@/lib/alpha/slip";

export const dynamic = "force-dynamic";

/** Session-scoped wrapper over `buildSlip` (`src/lib/alpha/slip.ts`) — the
 *  `/alpha` fixtures tab's slip-builder UI POSTs here; the `build_slip` MCP
 *  tool (`src/lib/mcp/alphaTools.ts`) calls the same underlying function so
 *  the two surfaces can never drift, per this program's "one function,
 *  several doors" convention (see `slip.ts`'s own header).
 *
 *  CLIENT CHOICE: auth is checked with the session-cookie client (only that
 *  client can read the request's session), but `buildSlip` itself is then
 *  called with a SERVICE-ROLE client, scoped in code to the just-verified
 *  `user.id` — `alpha_decisions`/`alpha_orders`/`alpha_ledger` are
 *  evaluator-written tables whose RLS policies grant regular users
 *  `select` only (docs/alpha/04-schema.md: "written only via service
 *  role"), so a `place:true` slip's writes would be silently rejected by
 *  RLS under the plain session client. This mirrors the exact pattern
 *  `src/lib/mcp/alphaTools.ts`'s `buildSlip` wrapper already uses (auth via
 *  API key, execute via service role) — same tables, same reasoning,
 *  different door. */

function isSelection(v: unknown): v is SlipSelectionInput {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return typeof s.fixtureId === "string" && typeof s.market === "string" && typeof s.outcome === "string";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Partial<BuildSlipInput> | null;
  if (!body || !Array.isArray(body.selections) || body.selections.length === 0 || !body.selections.every(isSelection)) {
    return NextResponse.json({ error: "selections (non-empty array of {fixtureId, market, outcome, book?}) is required" }, { status: 400 });
  }

  const result = await buildSlip(createServiceRoleClient(), user.id, body as BuildSlipInput);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
