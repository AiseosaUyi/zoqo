import { notImplemented } from "@/lib/apiNotImplemented";

export const dynamic = "force-dynamic";

/** Backs DataStore.getWallet/putWallet (src/lib/dataStore.ts) once a live
 *  Supabase project exists — see supabase/schema.sql's `wallets`/
 *  `positions`/`trade_history`/`open_orders` tables. */
export async function GET() {
  return notImplemented("GET /api/wallet");
}

export async function PUT() {
  return notImplemented("PUT /api/wallet");
}
