import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refreshes the Supabase session cookie on every request so a Route
 *  Handler never sees an expired access token — Supabase's own
 *  recommended pattern (refresh tokens are single-use; doing this once
 *  per navigation in proxy.ts avoids the race two parallel requests would
 *  hit refreshing the same expired token, see @supabase/ssr's README). */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Not `getSession()` — that reads the (possibly stale) JWT straight out
  // of the cookie without validating it. `getUser()` round-trips to
  // Supabase Auth, which is what actually triggers a refresh when needed.
  await supabase.auth.getUser();

  return response;
}
