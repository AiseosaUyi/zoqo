import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/brevo";
import { makeUnsubscribeToken } from "@/lib/unsubscribeToken";

export const dynamic = "force-dynamic";

/** Phase F's daily digest (TERMINAL_SPEC.md §6) — Vercel Cron hits this
 *  once a day (vercel.ts). Same CRON_SECRET-gated pattern as C2's
 *  evaluate-triggers route. For each opted-in user with an email on file:
 *  compute yesterday's real numbers, snapshot them (idempotent — a retry
 *  reuses the existing snapshot instead of recomputing and potentially
 *  drifting), send via Brevo, and once a week (Mondays) append a "traders
 *  to follow" nudge sourced from the real leaderboard_pnl view — no
 *  ranking/similarity logic beyond "top cash," which is what the spec
 *  itself leaves undefined; see leaderboard/page.tsx's own precedent for
 *  being explicit about what's illustrative vs. real. */

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = dayKey(yesterdayStart);
  const dayBeforeKey = dayKey(new Date(yesterdayStart.getTime() - 24 * 60 * 60 * 1000));

  const { data: profiles } = await supabase.from("profiles").select("user_id, email, handle, digest_opt_in").eq("digest_opt_in", true);
  const results: Array<{ userId: string; outcome: string }> = [];

  for (const profile of profiles ?? []) {
    if (!profile.email) {
      results.push({ userId: profile.user_id, outcome: "skipped: no email" });
      continue;
    }

    // daily_stats_snapshot stores CUMULATIVE xp/lessons_completed as of that
    // day (so tomorrow's run can diff against it) and that day's REALIZED
    // pnl (a direct trade_history range-sum, no diffing needed). The email
    // always reports a delta, computed fresh here regardless of whether
    // yesterday's row was just written or already existed from a prior run
    // — a retry must show the same numbers, not re-derive them differently.
    let yesterdayCumulative = (
      await supabase.from("daily_stats_snapshot").select("xp, lessons_completed, pnl").eq("user_id", profile.user_id).eq("day", yesterdayKey).maybeSingle()
    ).data;

    if (!yesterdayCumulative) {
      const [{ data: academy }, { data: trades }] = await Promise.all([
        supabase.from("academy_progress").select("xp, completed_lessons").eq("user_id", profile.user_id).maybeSingle(),
        supabase
          .from("trade_history")
          .select("pnl")
          .eq("user_id", profile.user_id)
          .gte("closed_at", yesterdayStart.toISOString())
          .lt("closed_at", todayStart.toISOString()),
      ]);
      yesterdayCumulative = {
        xp: academy?.xp ?? 0,
        lessons_completed: academy?.completed_lessons?.length ?? 0,
        pnl: (trades ?? []).reduce((sum, t) => sum + t.pnl, 0),
      };
      await supabase.from("daily_stats_snapshot").upsert({ user_id: profile.user_id, day: yesterdayKey, ...yesterdayCumulative });
    }

    const { data: dayBefore } = await supabase
      .from("daily_stats_snapshot")
      .select("xp, lessons_completed")
      .eq("user_id", profile.user_id)
      .eq("day", dayBeforeKey)
      .maybeSingle();
    // First-ever digest for a user has no prior baseline — delta is
    // honestly 0 rather than fabricated.
    const baselineXp = dayBefore?.xp ?? yesterdayCumulative.xp;
    const baselineLessons = dayBefore?.lessons_completed ?? yesterdayCumulative.lessons_completed;
    const snapshot = {
      xp: yesterdayCumulative.xp - baselineXp,
      lessons_completed: yesterdayCumulative.lessons_completed - baselineLessons,
      pnl: yesterdayCumulative.pnl,
    };

    const includeWeeklyNudge = now.getUTCDay() === 1; // Monday
    let nudgeHtml = "";
    if (includeWeeklyNudge) {
      const { data: top } = await supabase.from("leaderboard_pnl").select("handle, cash").order("cash", { ascending: false }).limit(3);
      if (top?.length) {
        nudgeHtml = `<p><strong>Traders to follow this week</strong> (by paper P&amp;L): ${top
          .map((t) => t.handle ?? "a trader")
          .join(", ")}.</p>`;
      }
    }

    const unsubToken = makeUnsubscribeToken(profile.user_id);
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111">
        <h2>ZOQO — your daily recap</h2>
        <p>Yesterday: ${snapshot.xp} XP, ${snapshot.lessons_completed} lesson${snapshot.lessons_completed === 1 ? "" : "s"}, ${snapshot.pnl >= 0 ? "+" : ""}$${snapshot.pnl.toFixed(2)} on paper.</p>
        ${nudgeHtml}
        <p style="margin-top:24px;font-size:12px;color:#666">
          <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/unsubscribe?token=${unsubToken}">Unsubscribe</a> from this digest.
        </p>
      </div>`;

    const sent = await sendEmail({
      to: { email: profile.email, name: profile.handle ?? undefined },
      subject: "Your ZOQO daily recap",
      htmlContent: html,
    });
    results.push({ userId: profile.user_id, outcome: sent.ok ? "sent" : `not sent: ${sent.reason}` });
  }

  return NextResponse.json({ ok: true, evaluated: profiles?.length ?? 0, results });
}
