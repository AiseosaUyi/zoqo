import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Next.js 16 renamed Middleware to Proxy (same mechanism, see
 *  node_modules/next/dist/docs/.../16-proxy.md) — this replaces the
 *  middleware.ts a pre-16 app would have here. Refreshes the Supabase
 *  session on every navigation; skips static assets and the API routes
 *  (which create their own request-scoped client via
 *  src/lib/supabase/server.ts and don't need the session pre-refreshed by
 *  a separate layer). */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api|favicon.ico|icon.svg|opengraph-image|twitter-image).*)"],
};
