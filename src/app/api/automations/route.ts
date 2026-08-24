import { notImplemented } from "@/lib/apiNotImplemented";

export const dynamic = "force-dynamic";

/** Backs DataStore.listAutomations/createAutomation (src/lib/dataStore.ts)
 *  once a live Supabase project exists — see supabase/schema.sql's
 *  `automations` table. Per-id operations (update/remove) are
 *  /api/automations/[id]. */
export async function GET() {
  return notImplemented("GET /api/automations");
}

export async function POST() {
  return notImplemented("POST /api/automations");
}
