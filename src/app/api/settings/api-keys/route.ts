import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";

/** Lists/creates the signed-in user's Zoqo MCP API keys (settings page —
 *  src/app/(app)/settings/page.tsx). Session-scoped via the cookie client
 *  (RLS enforces "own row only" — supabase/schema.sql), unlike the MCP
 *  route itself, which authenticates by key via the service-role client. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, scope, scopes, last_used_at, revoked_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return NextResponse.json(data ?? []);
}

const VALID_SCOPES = new Set(["read", "trade", "alpha:read", "alpha:run", "alpha:manage", "alpha:credentials"]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // `scopes` (array, preferred — docs/alpha/05-mcp-spec.md: "Settings UI
  // lets a key carry multiple scopes") with `scope` (single) as a
  // backward-compatible fallback for anything still posting the old shape.
  const body = (await req.json()) as { name?: string; scope?: string; scopes?: string[] };
  const name = body.name?.trim();
  const scopes = Array.isArray(body.scopes) && body.scopes.length > 0 ? body.scopes : body.scope ? [body.scope] : [];
  if (!name || scopes.length === 0 || !scopes.every((s) => VALID_SCOPES.has(s))) {
    return NextResponse.json({ error: `name and at least one valid scope are required (${[...VALID_SCOPES].join(", ")})` }, { status: 400 });
  }
  // `scope` (legacy single column, still has a NOT NULL + check constraint)
  // holds the first selected scope so old code paths that only ever read
  // `.scope` keep working; `scopes` is the full set this key actually has.
  const legacyScope = scopes[0] as "read" | "trade" | "alpha:read" | "alpha:run" | "alpha:manage" | "alpha:credentials";

  const { raw, hash, prefix } = generateApiKey();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({ user_id: user.id, name, key_hash: hash, key_prefix: prefix, scope: legacyScope, scopes })
    .select("id, name, key_prefix, scope, scopes, created_at")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  // The only time the raw key is ever returned — not retrievable again.
  return NextResponse.json({ ...data, rawKey: raw });
}
