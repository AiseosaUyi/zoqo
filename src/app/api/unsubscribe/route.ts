import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyUnsubscribeToken } from "@/lib/unsubscribeToken";

export const dynamic = "force-dynamic";

/** One-click unsubscribe from the daily digest — no sign-in required
 *  (standard transactional-email UX), gated by a signed token
 *  (src/lib/unsubscribeToken.ts) minted into every digest send instead. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const userId = verifyUnsubscribeToken(token);
  const html = (message: string) =>
    `<!doctype html><html><body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#111">
      <h2>ZOQO</h2><p>${message}</p></body></html>`;

  if (!userId) {
    return new NextResponse(html("This unsubscribe link is invalid or expired."), {
      status: 400,
      headers: { "content-type": "text/html" },
    });
  }

  const supabase = createServiceRoleClient();
  await supabase.from("profiles").update({ digest_opt_in: false }).eq("user_id", userId);

  return new NextResponse(html("You're unsubscribed from ZOQO's daily digest. You can re-enable it any time in Settings."), {
    headers: { "content-type": "text/html" },
  });
}
