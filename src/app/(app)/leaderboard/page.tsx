"use client";
import * as React from "react";
import { Card, Tabs, Badge } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { useAcademy } from "@/lib/academy";
import { mulberry32 } from "@/lib/math";
import { usd, pct } from "@/lib/format";
import { AppHeader } from "@/components/trade/AppHeader";
import { Trophy, Users } from "lucide-react";

/** P&L board reuses the existing seeded leaderboard from profile.tsx as-is.
 *  The XP board is new: same deterministic-seed house style (see CLAUDE.md —
 *  never Math.random()), illustrative until Phase 2's backend gives every
 *  user a real, shared Academy XP total (see TERMINAL_SPEC.md §6). Friend
 *  groups (the "compete with my brothers" ask) are stubbed honestly rather
 *  than faked — they need real multi-user accounts, which is a Phase 2 item. */
export default function LeaderboardPage() {
  const [tab, setTab] = React.useState("pnl");
  const { leaderboard, myRank, avatarSeed } = useProfile();
  const { xp } = useAcademy();

  const xpBoard = React.useMemo(() => {
    const rng = mulberry32(hashStr(avatarSeed || "seed"));
    const rows = leaderboard.map((r) => ({
      name: r.name,
      you: r.you,
      xp: r.you ? xp : Math.round(200 + rng() * 3000),
    }));
    rows.sort((a, b) => b.xp - a.xp);
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [leaderboard, xp, avatarSeed]);

  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-2 flex items-center gap-2">
        <Trophy size={22} className="text-gold-600" />
        <h1 className="font-display text-[24px] font-black text-ink">Leaderboard</h1>
        <Badge color="gray" size="sm">Demo data</Badge>
      </div>
      <p className="mb-5 text-[13px] text-sub">
        Your rank and P&amp;L are real. Other traders&apos; balances are simulated for this demo —
        friend groups (private boards you can share an invite code for) need real accounts,
        coming with the Phase 2 backend, see the handoff.
      </p>

      <div className="mb-4 flex items-center justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          data={[
            { value: "pnl", label: "P&L" },
            { value: "xp", label: "Academy XP" },
          ]}
        />
        <button
          disabled
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-semibold text-sub opacity-60"
          title="Needs the Phase 2 backend — see handoff"
        >
          <Users size={13} /> Start a friend group
        </button>
      </div>

      <Card padding="none" className="overflow-hidden">
        {tab === "pnl" ? (
          <ul>
            {leaderboard.map((r) => (
              <li
                key={r.rank}
                className={`flex items-center justify-between px-4 py-3 ${r.you ? "bg-purple-50" : ""} ${
                  r.rank !== leaderboard.length ? "border-b border-line" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-[13px] font-bold text-sub nums">{r.rank}</span>
                  <span className="text-[14px] font-semibold text-ink">{r.name}</span>
                  {r.you && <Badge color="brand" size="sm">You</Badge>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="nums text-[13px] text-sub">{usd(r.portfolio)}</span>
                  <span className={`nums text-[13px] font-bold ${r.pnlPct >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {pct(r.pnlPct)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul>
            {xpBoard.map((r) => (
              <li
                key={r.rank}
                className={`flex items-center justify-between px-4 py-3 ${r.you ? "bg-purple-50" : ""} ${
                  r.rank !== xpBoard.length ? "border-b border-line" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-[13px] font-bold text-sub nums">{r.rank}</span>
                  <span className="text-[14px] font-semibold text-ink">{r.name}</span>
                  {r.you && <Badge color="brand" size="sm">You</Badge>}
                </div>
                <span className="nums text-[13px] font-bold text-purple-700">{r.xp} XP</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {myRank > 0 && (
        <p className="mt-3 text-center text-[12px] text-sub">
          You&apos;re rank <span className="font-bold text-ink">#{myRank}</span> on P&amp;L.
        </p>
      )}
      </div>
    </>
  );
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
