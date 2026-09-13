import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Session-scoped CRUD over `broker_credentials` (docs/alpha/plans/
 *  phase-4-extra-venues.md's credentials manager, scoped down per this
 *  task's brief).
 *
 *  IMPORTANT — THIS IS UI/SCHEMA PLUMBING ONLY, NOT A REAL VAULT WRITE.
 *  The plan doc calls for `secret_ref` pointing at a real Supabase Vault
 *  secret. This build environment has no live Supabase project linked (no
 *  project to run Vault against — see docs/alpha/STATUS.md), so `POST`
 *  here stores a locally-generated OPAQUE PLACEHOLDER id
 *  (`vault:pending:<uuid>`) in `secret_ref`, never the submitted secret
 *  value itself — the raw value the caller posts is read once, used only
 *  to compute a short prefix for the confirmation response, and then
 *  discarded; it is never written to any column, logged, or echoed back in
 *  full. Wiring `secret_ref` to an actual Vault-stored secret (a real
 *  `vault.create_secret`/`vault.decrypted_secrets` round trip) is a
 *  Needs-Aise follow-up once a Supabase project is linked — tracked in
 *  docs/alpha/STATUS.md, not here.
 *
 *  Mirrors the existing `/api/settings/api-keys` pattern (session-scoped,
 *  never re-displays a stored secret) rather than reinventing one. `GET`
 *  only ever returns which venues have a credential row and when it was
 *  set — never a value, never even the placeholder `secret_ref` itself
 *  (there is nothing useful a client could do with that string, and
 *  withholding it is one less thing to accidentally leak later once it
 *  really does point at Vault). */

// Venues this program has an external-API-key credential concept for.
// zoqo-terminal/zoqo-predict/zoqo-sportsbook are internal and need no
// credential; polymarket-sim's Gamma/CLOB reads are public and keyless
// (polymarketSim.ts's own header), so it's deliberately excluded here too.
const CREDENTIAL_VENUES = ["manifold", "kalshi-demo", "bybit-demo", "deriv-virtual"] as const;
type CredentialVenue = (typeof CREDENTIAL_VENUES)[number];

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

  const { data } = await supabase.from("broker_credentials").select("broker, scope, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  return NextResponse.json(data ?? []);
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
  const secret = typeof body.secret === "string" ? body.secret.trim() : "";
  if (!secret || secret.length > 500) {
    return NextResponse.json({ error: "secret is required (max 500 chars)" }, { status: 400 });
  }
  const scope = typeof body.scope === "string" && VALID_SCOPES.has(body.scope) ? body.scope : "trade";

  // The only use the raw secret is ever put to: a short, non-reversible
  // confirmation prefix in the response below. Never persisted, logged, or
  // returned in full.
  const prefix = secret.slice(0, 4);
  const placeholderRef = `vault:pending:${crypto.randomUUID()}`;

  const { data: existing } = await supabase.from("broker_credentials").select("id").eq("user_id", user.id).eq("broker", body.broker).maybeSingle();

  if (existing) {
    const { error } = await supabase.from("broker_credentials").update({ scope, secret_ref: placeholderRef }).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from("broker_credentials").insert({ user_id: user.id, broker: body.broker, scope, secret_ref: placeholderRef });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, broker: body.broker, scope, keyPrefix: `${prefix}${"•".repeat(Math.max(0, secret.length - 4))}` });
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
