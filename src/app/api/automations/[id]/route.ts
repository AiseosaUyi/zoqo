import { notImplemented } from "@/lib/apiNotImplemented";

export const dynamic = "force-dynamic";

/** Backs DataStore.updateAutomation/removeAutomation (src/lib/dataStore.ts)
 *  once a live Supabase project exists. */
export async function PATCH() {
  return notImplemented("PATCH /api/automations/[id]");
}

export async function DELETE() {
  return notImplemented("DELETE /api/automations/[id]");
}
