import { NextRequest, NextResponse } from "next/server";
import { notImplemented } from "@/lib/apiNotImplemented";

export const dynamic = "force-dynamic";

/** Phase C's trigger evaluator (spec §8) — Vercel Cron hits this once a
 *  minute. Not user-callable: authenticated by a shared secret (CRON_SECRET
 *  in .env.example), not a user session, since there is no single "user"
 *  for a job that evaluates every enabled trigger across every account.
 *  Once built, executes through the same order-placement path
 *  terminalStore.openPosition already uses — no parallel "automation
 *  order" logic — and enforces every trigger's maxOrderSize/dailyCap. */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return notImplemented("POST /api/cron/evaluate-triggers");
}
