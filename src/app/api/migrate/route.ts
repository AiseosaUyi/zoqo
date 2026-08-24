import { notImplemented } from "@/lib/apiNotImplemented";

export const dynamic = "force-dynamic";

/** Backs DataStore.migrateFromLocalStorage (src/lib/dataStore.ts) — the
 *  one-shot import a client fires on first real sign-in with pre-existing
 *  localStorage data (see the plan's migration-on-first-login step).
 *  Insert-if-not-exists per user, so it's safe to call more than once. */
export async function POST() {
  return notImplemented("POST /api/migrate");
}
