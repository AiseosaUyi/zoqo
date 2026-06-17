"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Bell, ChevronDown, Lock, Palette, Plus, Sparkles } from "lucide-react";
import { SegmentedControl, Badge } from "@/components/ui";
import { usd } from "@/lib/format";
import { useZoqo } from "@/lib/store";
import { cn } from "@/lib/cn";
import { MARKET_DURATIONS } from "@/lib/timeframe";
import { DepositModal } from "./DepositModal";
import { ProfileMenu } from "./ProfileMenu";

export interface TopNavProps {
  showBack?: boolean;
  duration: string; // selected market duration (5m/10m/15m/30m/1h)
  onDuration: (d: string) => void;
}

export function TopNav({ showBack, duration, onDuration }: TopNavProps) {
  const { portfolioValue, cash, connected, source, btc, nextDepositAt } = useZoqo();
  const [depositOpen, setDepositOpen] = React.useState(false);
  const [now, setNow] = React.useState(0); // 0 until mounted → no SSR/client drift
  React.useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const locked = now > 0 && now < nextDepositAt;
  const remainingH = Math.ceil((nextDepositAt - now) / 3600_000);

  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b bg-surface/90 px-3 backdrop-blur-md sm:gap-3 sm:px-4">
      <Link href="/" className="flex items-center gap-1.5">
        <span className="font-display text-[26px] font-black leading-none tracking-tight text-ink">
          ZOQO
        </span>
      </Link>

      {showBack ? (
        <Link
          href="/"
          className="ml-2 inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-[13px] font-medium text-sub hover:bg-gray-100 hover:text-ink"
        >
          <ArrowLeft size={15} /> Back
        </Link>
      ) : (
        <button className="ml-2 inline-flex items-center gap-1.5 rounded-[8px] bg-muted px-2.5 py-1.5 text-[13px] font-semibold">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-orange-500 text-[9px] font-black text-white">
            ₿
          </span>
          BTC
          <ChevronDown size={14} className="text-sub" />
        </button>
      )}

      <SegmentedControl
        data={MARKET_DURATIONS.map((d) => ({ value: d.key, label: d.label }))}
        value={duration}
        onChange={onDuration}
        size="sm"
        className="ml-1 hidden lg:inline-flex"
      />
      <span className="hidden text-[11px] text-sub lg:inline">market</span>

      <Badge color="up" variant="dot" className="ml-1 hidden md:inline-flex">
        {connected ? "Live" : "Connecting"} · {source}
      </Badge>

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={() => setDepositOpen(true)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors",
            locked
              ? "bg-gold-100 text-gold-800 hover:bg-gold-200"
              : "bg-green-500 text-white hover:bg-green-600",
          )}
        >
          {locked ? <Lock size={13} /> : <Plus size={14} />}
          {locked ? `Deposit in ${remainingH}h` : "Deposit"}
        </button>

        <div className="hidden items-center gap-5 sm:flex">
          <Stat label="Portfolio" value={usd(portfolioValue)} />
          <Stat label="Cash" value={usd(cash)} />
        </div>

        <Link
          href="/system"
          title="Design system"
          className="hidden h-8 w-8 place-items-center rounded-full hover:bg-gray-100 lg:grid"
        >
          <Palette size={17} className="text-sub" />
        </Link>
        <button className="hidden h-8 w-8 place-items-center rounded-full hover:bg-gray-100 lg:grid">
          <Bell size={17} className="text-sub" />
        </button>
        <ProfileMenu />
        <button className="hidden items-center gap-1 rounded-full bg-gray-900 px-3 py-1.5 text-[12px] font-bold text-white sm:inline-flex">
          <Sparkles size={13} /> AI
        </button>
      </div>
      {/* live BTC ticker tucked for accessibility */}
      <span className="sr-only">BTC {btc ?? "—"}</span>
      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="text-[11px] text-sub">{label}</span>
      <span className="mt-1 text-[14px] font-bold text-ink nums">{value}</span>
    </div>
  );
}
