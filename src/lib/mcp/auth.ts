import { createHash, randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Zoqo MCP server auth (TERMINAL_SPEC.md §7) — a per-user API key, `read`
 *  or `trade` scope, generated once and shown only at creation; only its
 *  SHA-256 hash is ever persisted (api_keys.key_hash). Verified here via
 *  createServiceRoleClient() since an MCP request carries no Supabase
 *  session cookie — the key itself IS the identity. */

const KEY_PREFIX_LEN = 12;

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `zoqo_${randomBytes(24).toString("hex")}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, KEY_PREFIX_LEN) };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface VerifiedKey {
  userId: string;
  scope: "read" | "trade";
}

/** Looks up a raw bearer token by its hash. Returns null for missing/
 *  revoked keys — caller (withMcpAuth's verify callback) treats null as
 *  "unauthenticated," never falling back to any other identity source. */
export async function verifyApiKey(rawKey: string): Promise<VerifiedKey | null> {
  const hash = hashApiKey(rawKey);
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("api_keys").select("user_id, scope, revoked_at").eq("key_hash", hash).maybeSingle();
  if (!data || data.revoked_at) return null;
  // Awaited, not fire-and-forget: an unawaited update here gets silently
  // dropped once the serverless function's response returns and the
  // runtime freezes the instance — confirmed live (last_used_at never
  // advanced across dozens of real tool calls until this was awaited).
  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", hash);
  return { userId: data.user_id, scope: data.scope as "read" | "trade" };
}
