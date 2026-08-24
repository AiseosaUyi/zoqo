import { notImplemented } from "@/lib/apiNotImplemented";

export const dynamic = "force-dynamic";

/** Backs DataStore.getProfile/putProfile (src/lib/dataStore.ts) once a live
 *  Supabase project exists — see supabase/schema.sql's `profiles` table.
 *  Also the eventual home for real Supabase Auth session handling, once
 *  profile.tsx's mocked email+OTP flow is swapped for signInWithOtp. */
export async function GET() {
  return notImplemented("GET /api/profile");
}

export async function PUT() {
  return notImplemented("PUT /api/profile");
}
