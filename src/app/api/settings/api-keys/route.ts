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
    .select("id, name, key_prefix, scope, last_used_at, revoked_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name, scope } = (await req.json()) as { name: string; scope: "read" | "trade" };
  if (!name?.trim() || (scope !== "read" && scope !== "trade")) {
    return NextResponse.json({ error: "name and a valid scope (read|trade) are required" }, { status: 400 });
  }

  const { raw, hash, prefix } = generateApiKey();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({ user_id: user.id, name: name.trim(), key_hash: hash, key_prefix: prefix, scope })
    .select("id, name, key_prefix, scope, created_at")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  // The only time the raw key is ever returned — not retrievable again.
  return NextResponse.json({ ...data, rawKey: raw });
}
