import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/** Supabase client for Route Handlers (Next.js 16's `cookies()` is async —
 *  every caller must `await createClient()`). Reads/writes the session via
 *  the request's own cookies, same identity-propagation pattern every
 *  `/api/*` route in this repo already needs (dataStore.ts's "every call is
 *  implicitly scoped to the caller's session" contract). `setAll` can throw
 *  when called from a Server Component (which can't set cookies) — routes
 *  never hit that path, only pages would, and this app's pages don't call
 *  this directly, so the try/catch here is defensive, not load-bearing. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // called from a context that can't set cookies — ignore
          }
        },
      },
    },
  );
}

/** Service-role client — bypasses Row Level Security. Only for the cron
 *  evaluator (Phase C) and the migration route's insert-if-not-exists check,
 *  both of which enforce their own scoping in code rather than relying on
 *  RLS. Never import this into anything a user session could reach. */
export function createServiceRoleClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}
