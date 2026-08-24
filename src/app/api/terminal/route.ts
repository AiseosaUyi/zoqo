import { notImplemented } from "@/lib/apiNotImplemented";

export const dynamic = "force-dynamic";

/** Backs DataStore.getTerminal/putTerminal (src/lib/dataStore.ts) once a
 *  live Supabase project exists — see supabase/schema.sql's `positions`/
 *  `trade_history` tables (kind = 'terminal'). */
export async function GET() {
  return notImplemented("GET /api/terminal");
}

export async function PUT() {
  return notImplemented("PUT /api/terminal");
}
