import { createHash, randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Zoqo MCP server auth (TERMINAL_SPEC.md §7, extended by ZOQO Alpha's MCP
 *  v2 — docs/alpha/05-mcp-spec.md) — a per-user API key, one or more scopes,
 *  generated once and shown only at creation; only its SHA-256 hash is ever
 *  persisted (api_keys.key_hash). Verified here via createServiceRoleClient()
 *  since an MCP request carries no Supabase session cookie — the key itself
 *  IS the identity.
 *
 *  Scopes migration: `scope` (single, legacy) stays populated for backward
 *  compatibility with keys issued before the Alpha scopes existed; `scopes`
 *  (array, new) is the multi-scope column Alpha's `alpha:read`/`alpha:run`/
 *  `alpha:manage`/`alpha:credentials` keys use. A key with only `scope` set
 *  reads as `[scope]` here so every caller can treat `scopes` as the single
 *  source of truth without a legacy branch of its own. */

const KEY_PREFIX_LEN = 12;

export type ApiKeyScope = "read" | "trade" | "alpha:read" | "alpha:run" | "alpha:manage" | "alpha:credentials";

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `zoqo_${randomBytes(24).toString("hex")}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, KEY_PREFIX_LEN) };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface VerifiedKey {
  userId: string;
  /** Legacy single scope — kept for callers that only ever dealt with
   *  read/trade. Prefer `scopes`. */
  scope: "read" | "trade";
  scopes: ApiKeyScope[];
}

/** Looks up a raw bearer token by its hash. Returns null for missing/
 *  revoked keys — caller (withMcpAuth's verify callback) treats null as
 *  "unauthenticated," never falling back to any other identity source. */
export async function verifyApiKey(rawKey: string): Promise<VerifiedKey | null> {
  const hash = hashApiKey(rawKey);
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("api_keys").select("user_id, scope, scopes, revoked_at").eq("key_hash", hash).maybeSingle();
  if (!data || data.revoked_at) return null;
  // Awaited, not fire-and-forget: an unawaited update here gets silently
  // dropped once the serverless function's response returns and the
  // runtime freezes the instance — confirmed live (last_used_at never
  // advanced across dozens of real tool calls until this was awaited).
  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", hash);
  const scope = data.scope as "read" | "trade";
  const scopes = data.scopes && data.scopes.length > 0 ? (data.scopes as ApiKeyScope[]) : [scope];
  return { userId: data.user_id, scope, scopes };
}
