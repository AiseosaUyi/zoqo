import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";
import { CREDENTIAL_VENUES, type CredentialVenue } from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Session-scoped CRUD over `broker_credentials` — thin wrapper over
 *  `service.listCredentials`/`service.setVenueCredentials`, the same
 *  functions MCP's `set_venue_credentials` tool calls (docs/alpha/
 *  05-mcp-spec.md), so the UI and an agent go through one code path.
 *
 *  `setVenueCredentials`'s real Supabase Vault write (docs/alpha/
 *  PROMPT-alpha-finish.md §3) isn't appliable in this environment yet — no
 *  `SUPABASE_ACCESS_TOKEN`/DB credential to run the migration that defines
 *  `alpha_store_secret` (see docs/alpha/STATUS.md) — so it still stores an
 *  opaque `vault:pending:<uuid>` placeholder for now; the raw secret this
 *  route receives is read once inside `service.ts`, used only to compute a
 *  short confirmation prefix, and never persisted, logged, or echoed back
 *  in full. `GET` only ever returns which venues have a credential row and
 *  when it was set — never a value, never even the placeholder `secret_ref`
 *  itself. */

function isCredentialVenue(v: unknown): v is CredentialVenue {
  return typeof v === "string" && (CREDENTIAL_VENUES as readonly string[]).includes(v);
}

const VALID_SCOPES = new Set(["read", "trade"]);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json(await service.listCredentials(supabase, user.id));
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { broker?: unknown; secret?: unknown; scope?: unknown } | null;
  if (!body || !isCredentialVenue(body.broker)) {
    return NextResponse.json({ error: `broker must be one of ${CREDENTIAL_VENUES.join(", ")}` }, { status: 400 });
  }
  if (typeof body.secret !== "string" || !body.secret.trim()) {
    return NextResponse.json({ error: "secret is required (max 500 chars)" }, { status: 400 });
  }
  const scope = typeof body.scope === "string" && VALID_SCOPES.has(body.scope) ? (body.scope as "read" | "trade") : "trade";

  try {
    const result = await service.setVenueCredentials(supabase, user.id, { venue: body.broker, secret: body.secret, scope });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { broker?: unknown } | null;
  if (!body || !isCredentialVenue(body.broker)) {
    return NextResponse.json({ error: `broker must be one of ${CREDENTIAL_VENUES.join(", ")}` }, { status: 400 });
  }

  await supabase.from("broker_credentials").delete().eq("user_id", user.id).eq("broker", body.broker);
  return NextResponse.json({ ok: true });
}
