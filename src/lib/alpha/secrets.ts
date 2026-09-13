/** Venue credential lookup (docs/alpha/03-architecture.md §3, phase-2-manifold.md).
 *  Long-term this reads `broker_credentials.secret_ref` out of Supabase
 *  Vault; Phase 2 implements ONLY the env-var fallback for the single-user
 *  phase this environment actually runs in (no live Supabase Vault to read
 *  from here yet — see docs/alpha/STATUS.md). `userId` is accepted now (and
 *  intentionally unused by the env-var path) so call sites don't change
 *  shape when a real per-user Vault lookup lands later; there is no Vault
 *  branch in this file because nothing calls one yet — adding a stub that's
 *  never exercised would just be dead code, per this phase's build prompt. */

const VENUE_ENV_KEY: Record<string, string> = {
  manifold: "MANIFOLD_API_KEY",
};

function envVarNameFor(venue: string): string {
  return VENUE_ENV_KEY[venue] ?? `${venue.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

/** Returns the raw API key/secret for `venue`, or null if unset. Never
 *  throws — an absent credential is a normal, expected state (e.g. no
 *  MANIFOLD_API_KEY in this environment), not an error condition. */
export async function getVenueSecret(userId: string, venue: string): Promise<string | null> {
  void userId; // unused until a real per-user Vault-backed lookup replaces this
  const envVar = envVarNameFor(venue);
  return process.env[envVar] || null;
}
