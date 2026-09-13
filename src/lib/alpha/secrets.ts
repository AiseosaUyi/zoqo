import { createServiceRoleClient } from "@/lib/supabase/server";

/** Venue credential lookup (docs/alpha/03-architecture.md §3,
 *  phase-2-manifold.md, PROMPT-alpha-finish.md §3). Resolves a per-user
 *  Supabase Vault secret first (`broker_credentials.secret_ref`, written by
 *  `service.setVenueCredentials`), falling back to the env var — the same
 *  two-lookup order the architecture doc always specified, now both
 *  branches actually exist. The Vault branch is a no-op (returns null,
 *  falls through) whenever there's nothing to find: no credential row, a
 *  still-pending placeholder ref (migration not applied to the linked
 *  project yet — see docs/alpha/STATUS.md), or `alpha_read_secret` isn't
 *  defined in this Postgres yet. Never logs the decrypted value. */

const VENUE_ENV_KEY: Record<string, string> = {
  manifold: "MANIFOLD_API_KEY",
};

/** Exported so `setupStatus.ts` (the "needs setup" panel on `/alpha` and the
 *  `get_health` MCP tool) can report the exact env var name a venue needs
 *  without duplicating this naming convention — one source of truth. */
export function envVarNameFor(venue: string): string {
  return VENUE_ENV_KEY[venue] ?? `${venue.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

const VAULT_PREFIX = "vault:";
const VAULT_PENDING_PREFIX = "vault:pending:";

async function getVaultSecret(userId: string, venue: string): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data: cred } = await supabase.from("broker_credentials").select("secret_ref").eq("user_id", userId).eq("broker", venue).maybeSingle();
    const ref = cred?.secret_ref;
    if (!ref || !ref.startsWith(VAULT_PREFIX) || ref.startsWith(VAULT_PENDING_PREFIX)) return null;
    const secretId = ref.slice(VAULT_PREFIX.length);
    const { data: plaintext, error } = await supabase.rpc("alpha_read_secret", { secret_id: secretId });
    if (error || !plaintext) return null;
    return plaintext;
  } catch {
    return null; // no live project reachable, RPC undefined, or a transient error — env var is the honest fallback either way
  }
}

/** Returns the raw API key/secret for `venue`, or null if unset anywhere.
 *  Never throws — an absent credential is a normal, expected state (e.g. no
 *  MANIFOLD_API_KEY in this environment), not an error condition. */
export async function getVenueSecret(userId: string, venue: string): Promise<string | null> {
  const vaultSecret = await getVaultSecret(userId, venue);
  if (vaultSecret) return vaultSecret;
  const envVar = envVarNameFor(venue);
  return process.env[envVar] || null;
}
