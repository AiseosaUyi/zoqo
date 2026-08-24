import { notImplemented } from "@/lib/apiNotImplemented";

export const dynamic = "force-dynamic";

/** Backs DataStore.getAcademy/putAcademy (src/lib/dataStore.ts) once a live
 *  Supabase project exists — see supabase/schema.sql's `academy_progress`
 *  table. */
export async function GET() {
  return notImplemented("GET /api/academy");
}

export async function PUT() {
  return notImplemented("PUT /api/academy");
}
