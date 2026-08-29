import { createHmac } from "crypto";

/** Signed, sessionless unsubscribe link for the daily digest email — HMAC
 *  over the user id, keyed off SUPABASE_SERVICE_ROLE_KEY (already a real
 *  secret only this server has; no new env var to provision just for this).
 *  Not a general-purpose auth token — verifyUnsubscribeToken only proves
 *  "this token was minted server-side for this userId," nothing more, and
 *  the one route that accepts it only ever flips one boolean. */

function secret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function makeUnsubscribeToken(userId: string): string {
  const sig = createHmac("sha256", secret()).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [userId, sig] = token.split(".");
  if (!userId || !sig) return null;
  const expected = createHmac("sha256", secret()).update(userId).digest("hex");
  return sig === expected ? userId : null;
}
